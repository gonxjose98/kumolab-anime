import { supabaseAdmin } from '@/lib/supabase/admin';
import { fetchIGDashboardData, type IGDashboardData } from '@/lib/social/ig-insights';
import { fetchThreadsSnapshot, type PlatformSnapshot } from '@/lib/social/social-insights';
import { getViewsSummary, refreshRecentDailyViews, type ViewsSummary } from '@/lib/analytics/daily-views';

export interface TopPost {
    id: string;
    title: string;
    slug: string;
    claim: string | null;
    source: string | null;
    publishedAt: string | null;
    image: string | null;
    isVideo: boolean;
    webViews: number;   // real on-site views (from page_views matched to slug)
    views: number;      // social views (ig+fb+tw+th)
    engagement: number; // likes + comments across platforms
    ig: number; fb: number; tw: number; th: number; // per-platform views
    platforms: PlatformMetrics; // per-platform detail (views/likes/comments) for the expand row
}
export interface PlatformStat { views: number; likes: number; comments: number; }
export interface PlatformMetrics {
    instagram?: PlatformStat;
    facebook?: PlatformStat;
    threads?: PlatformStat;
}
export interface ClaimPerf { claim: string; posts: number; totalViews: number; avgViews: number; }

export interface AnalyticsData {
    ig: IGDashboardData;          // followers + IG top recent (live from Graph)
    threads: PlatformSnapshot;    // followers
    views: ViewsSummary;          // daily views per platform (daily_views table)
    topPosts: TopPost[];
    claimPerf: ClaimPerf[];
    postedTotal: number;
    range: number;                // active time-range in days (0 = all-time)
}

const FALLBACK_IG: IGDashboardData = {
    snapshot: {
        ok: false, reason: 'IG fetch failed', followers: null, follows: null, mediaCount: null,
        views28d: null, reach28d: null, profileViews28d: null, websiteClicks28d: null,
        accountsEngaged28d: null, totalInteractions28d: null,
    },
    topRecent: [],
};

/** On-site views per post slug, from page_views (last 60d, bot-filtered). */
async function webViewsBySlug(days = 60): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    try {
        const since = new Date(Date.now() - days * 86_400_000);
        const { data } = await supabaseAdmin
            .from('page_views').select('path, is_bot').gte('timestamp', since.toISOString()).limit(100000);
        for (const row of data || []) {
            if (row.is_bot || !row.path) continue;
            // /blog/<slug> or /<slug> → slug
            const m = String(row.path).replace(/\/+$/, '').match(/\/(?:blog\/)?([^/]+)$/);
            if (!m) continue;
            const slug = m[1];
            map.set(slug, (map.get(slug) || 0) + 1);
        }
    } catch (e: any) { console.error('webViewsBySlug:', e?.message || e); }
    return map;
}

/** Best-performing published posts (on-site + social views, per-platform + claim-type). */
async function topPostsAndClaims(sinceIso: string | null = null, webDays = 60): Promise<{ topPosts: TopPost[]; claimPerf: ClaimPerf[]; postedTotal: number }> {
    try {
        let q = supabaseAdmin
            .from('posts')
            .select('id, title, slug, claim_type, source, published_at, image, social_metrics, social_ids', { count: 'exact' })
            .eq('status', 'published')
            .order('published_at', { ascending: false })
            .limit(500);
        if (sinceIso) q = q.gte('published_at', sinceIso);
        const [{ data, count }, webBySlug] = await Promise.all([
            q,
            webViewsBySlug(webDays),
        ]);

        const rows: TopPost[] = [];
        const claimAgg = new Map<string, { posts: number; views: number }>();
        for (const p of data || []) {
            const m: any = p.social_metrics || {};
            const ig = Number(m.instagram?.views || 0);
            const fb = Number(m.facebook?.views || 0);
            const tw = Number(m.twitter?.views || 0);
            const th = Number(m.threads?.views || 0);
            const views = ig + fb + tw + th;
            const engagement =
                Number(m.instagram?.likes || 0) + Number(m.instagram?.comments || 0) +
                Number(m.facebook?.likes || 0) + Number(m.facebook?.comments || 0) +
                Number(m.twitter?.likes || 0) + Number(m.twitter?.comments || 0) +
                Number(m.threads?.likes || 0) + Number(m.threads?.comments || 0);
            const webViews = webBySlug.get(p.slug) || 0;
            const platforms: PlatformMetrics = {};
            const pull = (o: any): PlatformStat => ({ views: Number(o?.views || 0), likes: Number(o?.likes || 0), comments: Number(o?.comments || 0) });
            if (m.instagram) platforms.instagram = pull(m.instagram);
            if (m.facebook) platforms.facebook = pull(m.facebook);
            if (m.threads) platforms.threads = pull(m.threads);
            rows.push({
                id: p.id, title: p.title, slug: p.slug,
                claim: (p.claim_type as string) || null, source: p.source || null,
                publishedAt: p.published_at || null, image: p.image || null,
                isVideo: !!(p.social_ids as any)?.staged_video_url,
                webViews, views, engagement, ig, fb, tw, th, platforms,
            });
            const key = (p.claim_type as string) || 'OTHER';
            const agg = claimAgg.get(key) || { posts: 0, views: 0 };
            agg.posts++; agg.views += webViews + views;
            claimAgg.set(key, agg);
        }
        // Rank by combined reach (on-site + social); on-site data exists today.
        const topPosts = rows.filter((r) => r.webViews + r.views > 0)
            .sort((a, b) => (b.webViews + b.views) - (a.webViews + a.views)).slice(0, 25);
        const claimPerf: ClaimPerf[] = [...claimAgg.entries()]
            .map(([claim, a]) => ({ claim, posts: a.posts, totalViews: a.views, avgViews: a.posts ? Math.round(a.views / a.posts) : 0 }))
            .filter((c) => c.totalViews > 0)
            .sort((a, b) => b.avgViews - a.avgViews);
        return { topPosts, claimPerf, postedTotal: count ?? rows.length };
    } catch (e: any) {
        console.error('topPostsAndClaims:', e?.message || e);
        return { topPosts: [], claimPerf: [], postedTotal: 0 };
    }
}

const DEAD_SNAP = (reason: string): PlatformSnapshot => ({ ok: false, reason, followers: null, views28d: null, engagement28d: null });

/** Refresh today's numbers first, but never let a slow Meta call hold the page. */
async function refreshQuietly(ms = 4000) {
    await Promise.race([
        refreshRecentDailyViews(2).catch((e) => console.error('refreshRecentDailyViews:', e?.message || e)),
        new Promise((r) => setTimeout(r, ms)),
    ]);
}

export async function getAnalyticsData(rangeDays = 30): Promise<AnalyticsData> {
    const sinceIso = rangeDays === 0 ? null : new Date(Date.now() - rangeDays * 86_400_000).toISOString();
    const webDays = rangeDays === 0 ? 365 : rangeDays;
    const [ig, threads, posts] = await Promise.all([
        fetchIGDashboardData(30).catch((e) => ({ ...FALLBACK_IG, snapshot: { ...FALLBACK_IG.snapshot, reason: e?.message ?? 'IG fetch failed' } })),
        fetchThreadsSnapshot(30).catch((e) => DEAD_SNAP(e?.message ?? 'Threads fetch failed')),
        topPostsAndClaims(sinceIso, webDays),
        refreshQuietly(),
    ]);
    const views = await getViewsSummary(rangeDays);
    return { ig, threads, views, ...posts, range: rangeDays };
}
