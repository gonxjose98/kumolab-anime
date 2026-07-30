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

/**
 * Refreshes the Meta page access token by exchanging it via the standard
 * fb_exchange_token flow. Each successful exchange resets the
 * data_access_expires_at window forward to a fresh 90 days, so calling
 * this on a cadence (~every 7-30 days) keeps the token healthy
 * indefinitely without manual re-consent.
 *
 * Calls the Vercel REST API to update the META_ACCESS_TOKEN env var
 * in-place when a new token is minted, then triggers a redeploy so the
 * new value is picked up. Requires:
 *   - META_APP_ID + META_APP_SECRET in env (used to call Meta)
 *   - VERCEL_TOKEN + VERCEL_PROJECT_ID + VERCEL_TEAM_ID (to update env)
 *
 * If any of those are missing the function logs and returns gracefully —
 * the existing token continues to work until its natural data-access
 * boundary, just without auto-refresh.
 */
export interface RefreshResult {
    ok: boolean;
    rotated: boolean;
    reason?: string;
    daysUntilDataAccessExpiry?: number | null;
}

/**
 * Record a rotation failure somewhere a human will actually see it.
 *
 * The cron hands its JSON to Vercel, which discards it, so a bad result there
 * reaches nobody. error_logs is what health-monitor reads, so writing here is
 * what converts silent decay into a visible fault.
 */
async function failRotation(reason: string, days?: number | null): Promise<RefreshResult> {
    const { logError } = await import('../logging/structured-logger');
    await logError({
        source: 'token-health.refresh-meta',
        errorMessage: reason,
        context: { days_until_data_access_expiry: days ?? null },
    }).catch(() => {});
    return { ok: false, rotated: false, reason, daysUntilDataAccessExpiry: days };
}

export async function refreshMetaToken(): Promise<RefreshResult> {
    const currentToken = process.env.META_ACCESS_TOKEN;
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!currentToken) return { ok: false, rotated: false, reason: 'META_ACCESS_TOKEN not set' };
    if (!appId || !appSecret) {
        return { ok: false, rotated: false, reason: 'META_APP_ID / META_APP_SECRET missing — cannot refresh' };
    }

    // 1. Exchange the current token for a fresh long-lived one.
    const exchangeUrl = new URL('https://graph.facebook.com/v18.0/oauth/access_token');
    exchangeUrl.searchParams.set('grant_type', 'fb_exchange_token');
    exchangeUrl.searchParams.set('client_id', appId);
    exchangeUrl.searchParams.set('client_secret', appSecret);
    exchangeUrl.searchParams.set('fb_exchange_token', currentToken);

    let exchangeRes: Response;
    try {
        exchangeRes = await fetch(exchangeUrl.toString(), { cache: 'no-store' });
    } catch (e: any) {
        return { ok: false, rotated: false, reason: `Meta exchange fetch failed: ${e?.message || e}` };
    }
    const exchangeJson: any = await exchangeRes.json().catch(() => null);
    if (!exchangeJson || !exchangeJson.access_token) {
        const err = exchangeJson?.error?.message || `non-JSON response (status ${exchangeRes.status})`;
        return { ok: false, rotated: false, reason: `Meta exchange failed: ${err}` };
    }

    const newToken: string = exchangeJson.access_token;

    // 2. Verify the new token immediately so we don't write a broken value.
    const debugUrl = `https://graph.facebook.com/v18.0/debug_token?input_token=${encodeURIComponent(newToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
    const debugRes = await fetch(debugUrl, { cache: 'no-store' });
    const debugJson: any = await debugRes.json().catch(() => null);
    const data = debugJson?.data;
    if (!data?.is_valid) {
        return { ok: false, rotated: false, reason: `Meta returned new token but debug_token rejected it: ${debugJson?.error?.message || 'unknown'}` };
    }
    const dataAccessExpiresAt = typeof data.data_access_expires_at === 'number' ? data.data_access_expires_at : undefined;
    const daysUntilDataAccessExpiry = daysFromNow(dataAccessExpiresAt ?? null);

    // 3. Skip the env update if the new token is identical to the old one
    // (happens when the existing token is already fresh — Meta returns the
    // same string). Avoids an unnecessary Vercel redeploy.
    if (newToken === currentToken) {
        return { ok: true, rotated: false, reason: 'token unchanged (already fresh)', daysUntilDataAccessExpiry };
    }

    // 4. Update the Vercel env var if creds are present. If not, the new
    // token still works (we tested it) but we have no way to persist —
    // surface a warning rather than a hard error.
    const vercelToken = process.env.VERCEL_TOKEN;
    const vercelProjectId = process.env.VERCEL_PROJECT_ID;
    const vercelTeamId = process.env.VERCEL_TEAM_ID;

    // Same rule as the Threads refresh: a token we cannot PERSIST is a failed
    // rotation, not a warning. Meta issues the extended token once; discarding
    // it leaves the old one counting down while the cron reports success. This
    // returned ok:true before, which is why rotation could stop for weeks with
    // nothing in error_logs.
    if (!vercelToken || !vercelProjectId) {
        return await failRotation(
            'refreshed at Meta but VERCEL_TOKEN / VERCEL_PROJECT_ID not set — new token discarded, old one still expiring',
            daysUntilDataAccessExpiry,
        );
    }

    const teamQuery = vercelTeamId ? `?teamId=${vercelTeamId}` : '';
    // Find the existing META_ACCESS_TOKEN env entry so we can update in place
    const listRes = await fetch(`https://api.vercel.com/v9/projects/${vercelProjectId}/env${teamQuery}`, {
        headers: { Authorization: `Bearer ${vercelToken}` },
        cache: 'no-store',
    });
    const listJson: any = await listRes.json().catch(() => null);
    const envs: any[] = listJson?.envs || [];
    const existing = envs.filter(e => e.key === 'META_ACCESS_TOKEN');
    if (existing.length === 0) {
        return { ok: false, rotated: false, reason: 'META_ACCESS_TOKEN env entry not found via Vercel API' };
    }

    // Vercel stores prod and preview as separate entries — update each. If
    // any is type=sensitive, replace via DELETE+POST since sensitive vars
    // can't be PATCHed in place.
    // These writes are the ONLY thing that makes the rotation durable, so their
    // status has to be checked. Previously the responses were discarded and the
    // function returned rotated:true unconditionally — an expired VERCEL_TOKEN
    // would 401 on every call and still report a clean rotation, which is the
    // most misleading version of this failure.
    let allWritesOk = true;
    for (const e of existing) {
        if (e.type === 'sensitive') {
            // Sensitive vars can't be PATCHed in place, so replace them.
            const del = await fetch(`https://api.vercel.com/v9/projects/${vercelProjectId}/env/${e.id}${teamQuery}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${vercelToken}` },
            });
            const post = await fetch(`https://api.vercel.com/v10/projects/${vercelProjectId}/env${teamQuery}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'META_ACCESS_TOKEN', value: newToken, type: 'encrypted', target: e.target }),
            });
            // A DELETE that succeeded followed by a POST that failed leaves the
            // var MISSING entirely, which breaks publishing outright rather
            // than merely failing to rotate. Call it out specifically.
            if (del.ok && !post.ok) {
                return await failRotation(
                    `META_ACCESS_TOKEN was deleted but could not be recreated (POST ${post.status}) — the env var may now be MISSING`,
                    daysUntilDataAccessExpiry,
                );
            }
            if (!del.ok || !post.ok) allWritesOk = false;
        } else {
            const patch = await fetch(`https://api.vercel.com/v9/projects/${vercelProjectId}/env/${e.id}${teamQuery}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${vercelToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ value: newToken }),
            });
            if (!patch.ok) allWritesOk = false;
        }
    }

    if (!allWritesOk) {
        return await failRotation(
            'refreshed at Meta but writing the new token to the Vercel env failed (check VERCEL_TOKEN is not expired) — new token discarded, old one still expiring',
            daysUntilDataAccessExpiry,
        );
    }

    return { ok: true, rotated: true, daysUntilDataAccessExpiry };
}
