/**
 * Platform-token health check for the daily report.
 *
 * Calls Meta's /debug_token endpoint to surface:
 *   - is the token still valid?
 *   - when does the token itself expire? (Page tokens are 0 = never)
 *   - when does the data-access window close? (rolls forward on use; if it
 *     stops rolling, IG calls start returning empty data ~90 days later)
 *
 * Prefers app-token auth (META_APP_ID + META_APP_SECRET) for full debug
 * info; falls back to self-auth if those aren't set.
 */

export interface MetaTokenHealth {
    ok: boolean;
    type?: string;
    isValid?: boolean;
    expiresAt?: number; // unix seconds; 0 = never
    dataAccessExpiresAt?: number; // unix seconds
    daysUntilExpiry?: number | null;
    daysUntilDataAccessExpiry?: number | null;
    scopes?: string[];
    reason?: string;
}

const SECONDS_PER_DAY = 86_400;

function daysFromNow(unixSeconds: number | null | undefined): number | null {
    if (!unixSeconds || unixSeconds === 0) return null;
    return Math.floor((unixSeconds - Date.now() / 1000) / SECONDS_PER_DAY);
}

export async function checkMetaTokenHealth(): Promise<MetaTokenHealth> {
    const userToken = process.env.META_ACCESS_TOKEN;
    if (!userToken) {
        return { ok: false, reason: 'META_ACCESS_TOKEN not set' };
    }

    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const auth = appId && appSecret ? `${appId}|${appSecret}` : userToken;

    const url = `https://graph.facebook.com/v24.0/debug_token?input_token=${encodeURIComponent(userToken)}&access_token=${encodeURIComponent(auth)}`;

    let res: Response;
    try {
        res = await fetch(url, { cache: 'no-store' });
    } catch (e: any) {
        return { ok: false, reason: `fetch failed: ${e.message}` };
    }

    const json = await res.json().catch(() => null);
    if (!json) return { ok: false, reason: `non-JSON response (status ${res.status})` };

    if (json.error) {
        return { ok: false, reason: json.error.message ?? 'unknown Meta error' };
    }

    const d = json.data;
    if (!d) return { ok: false, reason: 'no data in debug_token response' };

    const expiresAt = typeof d.expires_at === 'number' ? d.expires_at : undefined;
    const dataAccessExpiresAt = typeof d.data_access_expires_at === 'number' ? d.data_access_expires_at : undefined;

    return {
        ok: d.is_valid === true,
        type: d.type,
        isValid: d.is_valid === true,
        expiresAt,
        dataAccessExpiresAt,
        daysUntilExpiry: expiresAt === 0 ? null : daysFromNow(expiresAt ?? null),
        daysUntilDataAccessExpiry: daysFromNow(dataAccessExpiresAt ?? null),
        scopes: Array.isArray(d.scopes) ? d.scopes : [],
    };
}
