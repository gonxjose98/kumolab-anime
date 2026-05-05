// Instagram account-level + recent-media insights for the admin dashboard.
//
// Requires the Meta token to carry `instagram_manage_insights` (re-OAuth'd
// 2026-05-04). All calls are best-effort — if Meta returns an error the
// card degrades gracefully instead of breaking the dashboard.

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_IG_ID = process.env.META_IG_ID;
const GRAPH = 'https://graph.facebook.com/v18.0';

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
        // Meta deprecated `impressions` for IG accounts in 2024; the modern
        // metric trio is `reach`, `profile_views`, `website_clicks`,
        // `accounts_engaged`. We fetch the lot in one shot.
        const since = Math.floor((Date.now() - 28 * 86400 * 1000) / 1000);
        const until = Math.floor(Date.now() / 1000);
        const insightsUrl = `${GRAPH}/${META_IG_ID}/insights?metric=reach,profile_views,website_clicks,accounts_engaged&period=day&metric_type=total_value&since=${since}&until=${until}&access_token=${META_ACCESS_TOKEN}`;
        const iRes = await fetch(insightsUrl, { cache: 'no-store' });
        const iData = await iRes.json();
        const byName: Record<string, number> = {};
        if (Array.isArray(iData.data)) {
            for (const row of iData.data) {
                const total = row?.total_value?.value;
                if (typeof total === 'number') {
                    byName[row.name] = total;
                } else if (Array.isArray(row.values)) {
                    byName[row.name] = row.values.reduce((acc: number, v: any) => acc + (v?.value || 0), 0);
                }
            }
        }

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

        // Per-post insights — Reels use `reach,plays,likes,comments`.
        // Image posts use `reach,impressions`. We try a permissive set
        // and fall back to whatever Meta returned.
        const enriched = await Promise.all(
            data.data.map(async (m: any): Promise<IGMediaInsight> => {
                const isReel = m.media_product_type === 'REELS' || m.media_type === 'VIDEO';
                const metricSet = isReel ? 'reach,plays' : 'reach,impressions';
                let views = 0;
                let reach = 0;
                try {
                    const insRes = await fetch(
                        `${GRAPH}/${m.id}/insights?metric=${metricSet}&access_token=${META_ACCESS_TOKEN}`,
                        { cache: 'no-store' },
                    );
                    const insJson = await insRes.json();
                    if (Array.isArray(insJson?.data)) {
                        for (const row of insJson.data) {
                            const v = row?.values?.[0]?.value || 0;
                            if (row.name === 'reach') reach = v;
                            if (row.name === 'plays' || row.name === 'impressions') views = v;
                        }
                    }
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
