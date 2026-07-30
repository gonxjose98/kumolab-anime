// Threads long-lived token refresh.
//
// Threads long-lived tokens expire 60 days after issuance. The refresh
// endpoint extends them another 60 days, but only if the current token
// is at least 24 hours old AND not already expired. We run this weekly
// on Tuesdays 05:00 UTC (one day after the Meta token refresh) so even
// if the token is on day 59 we have plenty of margin.
//
// On success, we hot-swap the new token into Vercel via the Vercel REST
// API so the next cron tick picks it up without a full redeploy.

import { logError } from '../logging/structured-logger';

const REFRESH_URL = 'https://graph.threads.net/refresh_access_token';

/**
 * Record a rotation failure where it will actually be SEEN.
 *
 * The cron's JSON response is discarded by Vercel, so a bad result there
 * reaches nobody. error_logs is what the health monitor reads, so writing here
 * is what turns this from silent decay into something that surfaces.
 */
async function fail(reason: string, days?: number): Promise<ThreadsTokenRefreshResult> {
    await logError({
        source: 'threads-token.refresh',
        errorMessage: reason,
        context: { days_until_expiry: days ?? null },
    }).catch(() => {});
    return { ok: false, rotated: false, daysUntilExpiry: days, reason };
}

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;

export interface ThreadsTokenRefreshResult {
    ok: boolean;
    rotated: boolean;
    daysUntilExpiry?: number;
    reason: string;
}

export async function refreshThreadsToken(): Promise<ThreadsTokenRefreshResult> {
    const current = process.env.THREADS_ACCESS_TOKEN;
    if (!current) {
        return { ok: false, rotated: false, reason: 'THREADS_ACCESS_TOKEN not set' };
    }

    try {
        const url = new URL(REFRESH_URL);
        url.searchParams.set('grant_type', 'th_refresh_token');
        url.searchParams.set('access_token', current);
        const res = await fetch(url);
        const data = await res.json();
        if (!data.access_token) {
            return {
                ok: false,
                rotated: false,
                reason: `Threads refresh failed: ${JSON.stringify(data).substring(0, 300)}`,
            };
        }

        const newToken = data.access_token as string;
        const expiresIn = data.expires_in as number | undefined;
        const days = expiresIn ? Math.floor(expiresIn / 86400) : undefined;

        // Hot-swap into Vercel env so the next cron tick uses the rotated token.
        //
        // A refresh we cannot PERSIST is a failure, not a success. Threads
        // hands back a new 60-day token exactly once; if we don't store it,
        // that token is gone and the OLD one keeps counting down to zero.
        // Both branches below used to return ok:true, so the cron reported
        // success while the account drifted toward a dead token with nothing
        // logged. `ok` now means "the system is in a good state", not "the HTTP
        // call worked" — that distinction is the whole bug.
        if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
            return await fail(
                'refreshed at Threads but VERCEL_TOKEN/VERCEL_PROJECT_ID missing — new token discarded, old one still expiring',
                days,
            );
        }

        const updateOk = await updateVercelEnv('THREADS_ACCESS_TOKEN', newToken);
        if (!updateOk) {
            return await fail(
                'refreshed at Threads but the Vercel env update failed — new token discarded, old one still expiring',
                days,
            );
        }
        return {
            ok: true,
            rotated: true,
            daysUntilExpiry: days,
            reason: 'rotated and pushed to Vercel env',
        };
    } catch (e: any) {
        return { ok: false, rotated: false, reason: `threw: ${e?.message || e}` };
    }
}

async function updateVercelEnv(name: string, newValue: string): Promise<boolean> {
    const teamQ = VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : '';
    const listRes = await fetch(
        `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env${teamQ}`,
        { headers: { authorization: `Bearer ${VERCEL_TOKEN}` } },
    );
    const listData = await listRes.json();
    const envs = (listData.envs || listData) as Array<{ id: string; key: string; target?: string[] }>;
    const targets = envs.filter(e => e.key === name);
    if (targets.length === 0) return false;
    let allOk = true;
    for (const env of targets) {
        const patchRes = await fetch(
            `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/env/${env.id}${teamQ}`,
            {
                method: 'PATCH',
                headers: {
                    authorization: `Bearer ${VERCEL_TOKEN}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ value: newValue }),
            },
        );
        if (!patchRes.ok) allOk = false;
    }
    return allOk;
}
