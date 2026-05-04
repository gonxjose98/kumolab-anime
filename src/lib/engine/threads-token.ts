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

const REFRESH_URL = 'https://graph.threads.net/refresh_access_token';

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

        // Hot-swap into Vercel env so the next cron tick uses the rotated token
        if (!VERCEL_TOKEN || !VERCEL_PROJECT_ID) {
            return {
                ok: true,
                rotated: false,
                daysUntilExpiry: days,
                reason: 'refreshed but VERCEL_TOKEN/VERCEL_PROJECT_ID missing — token NOT pushed to env',
            };
        }

        const updateOk = await updateVercelEnv('THREADS_ACCESS_TOKEN', newToken);
        return {
            ok: true,
            rotated: updateOk,
            daysUntilExpiry: days,
            reason: updateOk ? 'rotated and pushed to Vercel env' : 'refreshed but Vercel env update failed',
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
