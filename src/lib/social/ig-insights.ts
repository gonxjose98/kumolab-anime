// Instagram account-level + recent-media insights for the admin dashboard.
//
// Requires the Meta token to carry `instagram_manage_insights` (re-OAuth'd
// 2026-05-04). All calls are best-effort — if Meta returns an error the
// card degrades gracefully instead of breaking the dashboard.

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_IG_ID = process.env.META_IG_ID;
// Use v22.0 — the modern unified `views` metric replaced `plays` (Reels)
// and `impressions` (image/carousel) on v22 and rolled out April 2024.
// On v18, our previous `plays` calls returned an error and we silently
// fell back to 0, which is why every post showed 0 views.
const GRAPH = 'https://graph.facebook.com/v22.0';

export interface IGAccountSnapshot {
    ok: boolean;
    reason?: string;
    followers: number | null;
    follows: number | null;
    mediaCount: number | null;
    reach28d: number | null;
    profileViews28d: number | null;
    websiteClicks28d: number | null;
    accountsEngaged28d: number | null;
}

export interface IGMediaInsight {
    id: string;
    caption: string;
    permalink: string;
    thumbnail: string | null;
    mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REEL' | string;
    timestamp: string;
    likes: number;
    comments: number;
    views: number;
    reach: number;
}

export interface IGDashboardData {
    snapshot: IGAccountSnapshot;
    topRecent: IGMediaInsight[];
}

const DEAD: IGAccountSnapshot = {
    ok: false,
    followers: null,
    follows: null,
    mediaCount: null,
    reach28d: null,
    profileViews28d: null,
    websiteClicks28d: null,
    accountsEngaged28d: null,
};

export async function fetchIGDashboardData(): Promise<IGDashboardData> {
    if (!META_ACCESS_TOKEN || !META_IG_ID) {
        return {
            snapshot: { ...DEAD, reason: 'META_ACCESS_TOKEN or META_IG_ID missing' },
            topRecent: [],
        };
    }

    const [snapshot, topRecent] = await Promise.all([
        fetchAccountSnapshot(),
        fetchTopRecentMedia(8),
    ]);
    return { snapshot, topRecent };
}

async function fetchAccountSnapshot(): Promise<IGAccountSnapshot> {
    try {
        // 1) Static profile fields
        const fieldsUrl = `${GRAPH}/${META_IG_ID}?fields=followers_count,follows_count,media_count&access_token=${META_ACCESS_TOKEN}`;
        const fRes = await fetch(fieldsUrl, { cache: 'no-store' });
        const fData = await fRes.json();
        if (fData.error) {
            return { ...DEAD, reason: `profile: ${fData.error.message}` };
        }

        // 2) Rolling 28-day account insights.
        // On v22, account-level metrics that work without a specific
        // breakdown: `reach`, `profile_views`, `website_clicks`,
        // `accounts_engaged`. All require `metric_type=total_value`.
        const since = Math.floor((Date.now() - 28 * 86400 * 1000) / 1000);
        const until = Math.floor(Date.now() / 1000);
        const byName: Record<string, number> = {};
        // Each metric must be requested separately on v22 — the API
        // rejects mixed-cardinality metrics in a single call. Fetch in
        // parallel and merge.
        const metricNames = ['reach', 'profile_views', 'website_clicks', 'accounts_engaged'];
        await Promise.all(
            metricNames.map(async (name) => {
                try {
                    const url = `${GRAPH}/${META_IG_ID}/insights?metric=${name}&period=day&metric_type=total_value&since=${since}&until=${until}&access_token=${META_ACCESS_TOKEN}`;
                    const r = await fetch(url, { cache: 'no-store' });
                    const j = await r.json();
                    if (Array.isArray(j?.data)) {
                        for (const row of j.data) {
                            const total = row?.total_value?.value;
                            if (typeof total === 'number') byName[row.name] = total;
                            else if (Array.isArray(row.values)) {
                                byName[row.name] = row.values.reduce((acc: number, v: any) => acc + (v?.value || 0), 0);
                            }
                        }
                    }
                } catch {
                    // metric unavailable — leave undefined; UI shows —
                }
            }),
        );

        return {
            ok: true,
            followers: fData.followers_count ?? null,
            follows: fData.follows_count ?? null,
            mediaCount: fData.media_count ?? null,
            reach28d: byName.reach ?? null,
            profileViews28d: byName.profile_views ?? null,
            websiteClicks28d: byName.website_clicks ?? null,
            accountsEngaged28d: byName.accounts_engaged ?? null,
        };
    } catch (e: any) {
        return { ...DEAD, reason: `threw: ${e?.message || e}` };
    }
}

async function fetchTopRecentMedia(limit: number): Promise<IGMediaInsight[]> {
    try {
        const fields = 'id,caption,permalink,media_type,media_product_type,media_url,thumbnail_url,timestamp,like_count,comments_count';
        const url = `${GRAPH}/${META_IG_ID}/media?fields=${fields}&limit=${limit}&access_token=${META_ACCESS_TOKEN}`;
        const res = await fetch(url, { cache: 'no-store' });
        const data = await res.json();
        if (!Array.isArray(data?.data)) return [];

        // Per-post insights — Meta unified `plays` + `impressions` into
        // `views` on v22.0. Try `views,reach` first (works on every modern
        // media type), then fall back to legacy metric names per type.
        const enriched = await Promise.all(
            data.data.map(async (m: any): Promise<IGMediaInsight> => {
                const isReel = m.media_product_type === 'REELS' || m.media_type === 'VIDEO';
                let views = 0;
                let reach = 0;

                const tryMetrics = async (metrics: string): Promise<{ ok: boolean; views: number; reach: number }> => {
                    const r = await fetch(
                        `${GRAPH}/${m.id}/insights?metric=${metrics}&access_token=${META_ACCESS_TOKEN}`,
                        { cache: 'no-store' },
                    );
                    const j = await r.json();
                    if (j.error) return { ok: false, views: 0, reach: 0 };
                    let v = 0;
                    let rch = 0;
                    if (Array.isArray(j?.data)) {
                        for (const row of j.data) {
                            const val = row?.values?.[0]?.value ?? row?.total_value?.value ?? 0;
                            if (row.name === 'reach') rch = val;
                            if (row.name === 'views' || row.name === 'plays' || row.name === 'impressions') v = val;
                        }
                    }
                    return { ok: true, views: v, reach: rch };
                };

                try {
                    let res = await tryMetrics('views,reach');
                    if (!res.ok) {
                        res = await tryMetrics(isReel ? 'plays,reach' : 'impressions,reach');
                    }
                    views = res.views;
                    reach = res.reach;
                } catch {
                    // ignore — leave at 0
                }
                return {
                    id: m.id,
                    caption: (m.caption || '').slice(0, 140),
                    permalink: m.permalink || '',
                    thumbnail: m.thumbnail_url || m.media_url || null,
                    mediaType: isReel ? 'REEL' : (m.media_type || 'IMAGE'),
                    timestamp: m.timestamp || '',
                    likes: m.like_count || 0,
                    comments: m.comments_count || 0,
                    views,
                    reach,
                };
            }),
        );

        return enriched.sort((a, b) => (b.views || b.reach) - (a.views || a.reach));
    } catch {
        return [];
    }
}
