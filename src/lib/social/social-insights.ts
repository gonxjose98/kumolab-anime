// Account-level snapshots for Facebook Page + Threads, mirroring the Instagram
// snapshot in ig-insights.ts. All calls are best-effort: if Meta/Threads returns
// an error the card degrades to "—" instead of breaking the dashboard.

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;
const THREADS_USER_ID = process.env.THREADS_USER_ID;
const FB_PAGE_ID = '833836379820504'; // KumoLab Facebook Page (same id used by the publisher)
const GRAPH = 'https://graph.facebook.com/v22.0';
const THREADS = 'https://graph.threads.net/v1.0';

export interface PlatformSnapshot {
    ok: boolean;
    reason?: string;
    followers: number | null;
    views28d: number | null;
    engagement28d: number | null; // total interactions in the window
}

const DEAD = (reason: string): PlatformSnapshot => ({ ok: false, reason, followers: null, views28d: null, engagement28d: null });

const win28d = () => ({
    since: Math.floor((Date.now() - 28 * 86400 * 1000) / 1000),
    until: Math.floor(Date.now() / 1000),
});

/** Sum a Graph insights `data[]` array's daily values (handles total_value + values[]). */
function sumInsight(row: any): number {
    if (!row) return 0;
    if (typeof row?.total_value?.value === 'number') return row.total_value.value;
    if (Array.isArray(row.values)) return row.values.reduce((a: number, v: any) => a + (Number(v?.value) || 0), 0);
    return 0;
}

// ── Facebook Page ──────────────────────────────────────────────────────────
export async function fetchFacebookSnapshot(): Promise<PlatformSnapshot> {
    if (!META_ACCESS_TOKEN) return DEAD('META_ACCESS_TOKEN missing');
    try {
        const { since, until } = win28d();
        // 1) Follower count (page profile field).
        const profRes = await fetch(`${GRAPH}/${FB_PAGE_ID}?fields=followers_count,fan_count&access_token=${META_ACCESS_TOKEN}`, { cache: 'no-store' });
        const prof = await profRes.json();
        if (prof.error) return DEAD(`fb profile: ${prof.error.message}`);
        const followers = prof.followers_count ?? prof.fan_count ?? null;

        // 2) 28-day page impressions (views) + post engagements. Each metric
        //    fetched separately so one unavailable metric doesn't drop the other.
        const byName: Record<string, number> = {};
        await Promise.all(
            ['page_impressions', 'page_post_engagements'].map(async (metric) => {
                try {
                    const r = await fetch(`${GRAPH}/${FB_PAGE_ID}/insights?metric=${metric}&period=day&since=${since}&until=${until}&access_token=${META_ACCESS_TOKEN}`, { cache: 'no-store' });
                    const j = await r.json();
                    if (Array.isArray(j?.data)) for (const row of j.data) byName[row.name] = sumInsight(row);
                } catch { /* leave undefined */ }
            }),
        );

        return {
            ok: true,
            followers,
            views28d: byName.page_impressions ?? null,
            engagement28d: byName.page_post_engagements ?? null,
        };
    } catch (e: any) {
        return DEAD(`fb threw: ${e?.message || e}`);
    }
}

// ── Threads ────────────────────────────────────────────────────────────────
export async function fetchThreadsSnapshot(): Promise<PlatformSnapshot> {
    if (!THREADS_ACCESS_TOKEN || !THREADS_USER_ID) return DEAD('THREADS_ACCESS_TOKEN or THREADS_USER_ID missing');
    try {
        const { since, until } = win28d();
        // followers_count is a point-in-time metric (no since/until); the rest
        // are windowed. Fetch each independently and merge.
        const byName: Record<string, number> = {};
        await Promise.all([
            (async () => {
                try {
                    const r = await fetch(`${THREADS}/${THREADS_USER_ID}/threads_insights?metric=followers_count&access_token=${THREADS_ACCESS_TOKEN}`, { cache: 'no-store' });
                    const j = await r.json();
                    if (Array.isArray(j?.data)) for (const row of j.data) byName[row.name] = sumInsight(row);
                } catch { /* ignore */ }
            })(),
            (async () => {
                try {
                    const metrics = 'views,likes,replies,reposts,quotes';
                    const r = await fetch(`${THREADS}/${THREADS_USER_ID}/threads_insights?metric=${metrics}&since=${since}&until=${until}&access_token=${THREADS_ACCESS_TOKEN}`, { cache: 'no-store' });
                    const j = await r.json();
                    if (Array.isArray(j?.data)) for (const row of j.data) byName[row.name] = sumInsight(row);
                } catch { /* ignore */ }
            })(),
        ]);

        const engagement = (byName.likes || 0) + (byName.replies || 0) + (byName.reposts || 0) + (byName.quotes || 0);
        return {
            ok: true,
            followers: byName.followers_count ?? null,
            views28d: byName.views ?? null,
            engagement28d: engagement || null,
        };
    } catch (e: any) {
        return DEAD(`threads threw: ${e?.message || e}`);
    }
}
