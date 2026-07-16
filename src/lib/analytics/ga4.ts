// GA4 Data API client — pulls the website metrics our first-party page_views
// table can't produce (users, sessions, returning users, avg session duration,
// organic search sessions).
//
// Auth: a Google Cloud service account (ga4-reporting@kumolabanime-youtube)
// granted Viewer on GA4 property 545809238. Its JSON key is NOT a Vercel env
// var (we have no local Vercel token to set one) — it's stored in the
// service-role-only `app_secrets` table and read here via supabaseAdmin. An
// env var (GA4_SERVICE_ACCOUNT_JSON) still wins if ever set, so nothing breaks
// if we later move the key to Vercel.
//
// We sign the service-account JWT with Node's built-in crypto and exchange it
// for an access token, rather than pulling in the heavyweight googleapis SDK
// for two report calls. Requires the Node runtime (crypto) — not Edge.

import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

// The GA4 property that backs kumolabanime.com (created 2026-07-16). Not a
// secret; the Measurement ID is already public in the client tag.
export const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || '545809238';

// GA4 only started collecting when the tag went live (mid-July 2026). Months
// that ended before this have no GA4 data — callers should not treat the zeros
// GA4 returns for them as real, so we refuse to query pre-launch months.
export const GA4_MIN_MONTH = '2026-07-01';

const TOKEN_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

interface ServiceAccount {
    client_email: string;
    private_key: string;
    token_uri: string;
}

let saCache: ServiceAccount | null = null;

/** Load the service-account JSON from env (preferred) or the app_secrets table. */
async function getServiceAccount(): Promise<ServiceAccount | null> {
    if (saCache) return saCache;
    try {
        let raw = process.env.GA4_SERVICE_ACCOUNT_JSON || null;
        if (!raw) {
            const { data, error } = await supabaseAdmin
                .from('app_secrets')
                .select('value')
                .eq('key', 'ga4_service_account')
                .maybeSingle();
            if (error || !data?.value) return null;
            raw = data.value as string;
        }
        const sa = JSON.parse(raw) as ServiceAccount;
        if (!sa.client_email || !sa.private_key || !sa.token_uri) return null;
        saCache = sa;
        return sa;
    } catch {
        return null;
    }
}

function base64url(input: Buffer | string): string {
    return Buffer.from(input)
        .toString('base64')
        .replace(/=+$/, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

// Access tokens are good for ~1h; cache until shortly before expiry.
let tokenCache: { token: string; exp: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string | null> {
    const now = Math.floor(Date.now() / 1000);
    if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.token;
    try {
        const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
        const claim = base64url(
            JSON.stringify({
                iss: sa.client_email,
                scope: TOKEN_SCOPE,
                aud: sa.token_uri,
                exp: now + 3600,
                iat: now,
            }),
        );
        const unsigned = `${header}.${claim}`;
        const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key);
        const jwt = `${unsigned}.${base64url(signature)}`;

        const res = await fetch(sa.token_uri, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: jwt,
            }),
            cache: 'no-store',
        });
        const j = (await res.json()) as { access_token?: string; expires_in?: number };
        if (!j.access_token) return null;
        tokenCache = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
        return j.access_token;
    } catch {
        return null;
    }
}

export interface Ga4MonthMetrics {
    users: number | null;
    new_users: number | null;
    returning_users: number | null;
    sessions: number | null;
    pageviews: number | null;
    avg_session_sec: number | null;
    organic_google_sessions: number | null;
}

const GA4_DATA = 'https://analyticsdata.googleapis.com/v1beta';

function firstMetricRow(report: any): string[] {
    const row = report?.rows?.[0];
    return row?.metricValues?.map((m: any) => m?.value ?? '0') ?? [];
}

const num = (s: string | undefined): number | null => {
    if (s == null) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
};

/**
 * Pull one month's website metrics from GA4. `startDate`/`endDate` are inclusive
 * 'YYYY-MM-DD' (GA4's convention — endDate should be the LAST day of the month).
 * Returns null if creds are missing, the month predates GA4, or the API fails —
 * callers keep those metrics null rather than fabricating zeros.
 */
export async function fetchGa4MonthMetrics(
    startDate: string,
    endDate: string,
): Promise<Ga4MonthMetrics | null> {
    if (endDate < GA4_MIN_MONTH) return null; // whole month is before GA4 launch
    const sa = await getServiceAccount();
    if (!sa) return null;
    const token = await getAccessToken(sa);
    if (!token) return null;

    const dateRanges = [{ startDate, endDate }];
    try {
        const res = await fetch(`${GA4_DATA}/properties/${GA4_PROPERTY_ID}:batchRunReports`, {
            method: 'POST',
            headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify({
                requests: [
                    // 0 — account totals (no dimensions → single totals row).
                    {
                        dateRanges,
                        metrics: [
                            { name: 'totalUsers' },
                            { name: 'newUsers' },
                            { name: 'sessions' },
                            { name: 'screenPageViews' },
                            { name: 'averageSessionDuration' },
                        ],
                    },
                    // 1 — organic Google sessions (source=google, medium=organic).
                    {
                        dateRanges,
                        metrics: [{ name: 'sessions' }],
                        dimensionFilter: {
                            andGroup: {
                                expressions: [
                                    {
                                        filter: {
                                            fieldName: 'sessionSource',
                                            stringFilter: { matchType: 'EXACT', value: 'google' },
                                        },
                                    },
                                    {
                                        filter: {
                                            fieldName: 'sessionMedium',
                                            stringFilter: { matchType: 'EXACT', value: 'organic' },
                                        },
                                    },
                                ],
                            },
                        },
                    },
                ],
            }),
        });
        if (!res.ok) return null;
        const j = (await res.json()) as { reports?: any[] };
        const reports = j?.reports;
        if (!Array.isArray(reports) || reports.length < 2) return null;

        const [totalUsers, newUsers, sessions, pageviews, avgDuration] = firstMetricRow(reports[0]);
        const [organic] = firstMetricRow(reports[1]);

        const users = num(totalUsers);
        const newU = num(newUsers);
        const returning = users != null && newU != null ? Math.max(0, users - newU) : null;

        return {
            users,
            new_users: newU,
            returning_users: returning,
            sessions: num(sessions),
            pageviews: num(pageviews),
            avg_session_sec: avgDuration != null ? Math.round(Number(avgDuration)) : null,
            organic_google_sessions: num(organic),
        };
    } catch {
        return null;
    }
}
