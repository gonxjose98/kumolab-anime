import { supabaseAdmin } from '@/lib/supabase/admin';
import { fetchIGDashboardData, type IGDashboardData } from '@/lib/social/ig-insights';
import { fetchFacebookSnapshot, fetchThreadsSnapshot, type PlatformSnapshot } from '@/lib/social/social-insights';
import { fetchWebsiteTraffic, type WebsiteTraffic } from '@/lib/analytics/page-views';
import { fetchOrders } from '@/lib/orders';

export interface DayPoint { day: string; label: string; views: number; }
export interface PipelinePoint { day: string; label: string; published: number; accepted: number; found: number; score: number; }
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

export interface RevenuePoint { day: string; label: string; amount: number; }
export interface RevenueSummary {
    total: number;      // active (non-canceled) revenue in the window
    orders: number;
    aov: number;        // average order value
    currency: string;
    series: RevenuePoint[]; // revenue per day, last 30 days
    ok: boolean;        // false when Printful/Stripe isn't wired yet
}

export interface AnalyticsData {
    ig: IGDashboardData;
    fb: PlatformSnapshot;
    threads: PlatformSnapshot;
    web: WebsiteTraffic;
    viewsSeries: DayPoint[];
    pipeline: PipelinePoint[];
    topPosts: TopPost[];
    claimPerf: ClaimPerf[];
    postedTotal: number;
    revenue: RevenueSummary;
    range: number;        // active time-range in days (0 = all-time)
    socialDays: number;   // effective window for social account metrics (Meta caps at 30)
    siteViewsRange: number; // total website views in the active range
}

const FALLBACK_IG: IGDashboardData = {
    snapshot: {
        ok: false, reason: 'IG fetch failed', followers: null, follows: null, mediaCount: null,
        views28d: null, reach28d: null, profileViews28d: null, websiteClicks28d: null,
        accountsEngaged28d: null, totalInteractions28d: null,
    },
    topRecent: [],
};

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const dayLabel = (iso: string) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/** Website page-views bucketed per day for the last N days (bot-filtered). */
async function viewsPerDay(days = 30): Promise<DayPoint[]> {
    const since = new Date(Date.now() - days * 86_400_000);
    const buckets = new Map<string, number>();
    for (let i = 0; i < days; i++) buckets.set(dayKey(new Date(Date.now() - i * 86_400_000)), 0);
    try {
        const { data } = await supabaseAdmin
            .from('page_views')
            .select('timestamp, is_bot')
            .gte('timestamp', since.toISOString())
            .limit(100000);
        for (const row of data || []) {
            if (row.is_bot) continue;
            const k = dayKey(new Date(row.timestamp));
            if (buckets.has(k)) buckets.set(k, (buckets.get(k) || 0) + 1);
        }
    } catch (e: any) { console.error('viewsPerDay:', e?.message || e); }
    return [...buckets.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, views]) => ({ day, label: dayLabel(day), views }));
}

/** Pipeline history from daily_reports (published / accepted / found / avg score). */
async function pipelineHistory(days = 30): Promise<PipelinePoint[]> {
    try {
        const { data } = await supabaseAdmin
            .from('daily_reports')
            .select('report_date, posts_published, candidates_accepted, candidates_found, avg_content_score')
            .order('report_date', { ascending: false })
            .limit(days);
        return (data || [])
            .slice()
            .reverse()
            .map((r: any) => ({
                day: r.report_date,
                label: dayLabel(String(r.report_date).slice(0, 10)),
                published: r.posts_published ?? 0,
                accepted: r.candidates_accepted ?? 0,
                found: r.candidates_found ?? 0,
                score: r.avg_content_score != null ? Math.round(Number(r.avg_content_score) * 10) / 10 : 0,
            }));
    } catch (e: any) { console.error('pipelineHistory:', e?.message || e); return []; }
}

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

/** Order/merch revenue from the live Printful order feed, per-day for 30 days. */
async function getRevenue(days = 30): Promise<RevenueSummary> {
    try {
        const { orders } = await fetchOrders(150);
        const cutoff = Date.now() - days * 86_400_000;
        const active = (orders || []).filter((o) => o.stage !== 'canceled' && o.createdAt && new Date(o.createdAt).getTime() >= cutoff);
        const total = active.reduce((s, o) => s + (Number(o.total) || 0), 0);
        const count = active.length;
        const currency = orders[0]?.currency || 'USD';
        const buckets = new Map<string, number>();
        for (let i = 0; i < days; i++) buckets.set(dayKey(new Date(Date.now() - i * 86_400_000)), 0);
        for (const o of active) {
            if (!o.createdAt) continue;
            const k = dayKey(new Date(o.createdAt));
            if (buckets.has(k)) buckets.set(k, (buckets.get(k) || 0) + (Number(o.total) || 0));
        }
        const series = [...buckets.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([day, amount]) => ({ day, label: dayLabel(day), amount: Math.round(amount * 100) / 100 }));
        return { total, orders: count, aov: count ? total / count : 0, currency, series, ok: true };
    } catch (e: any) {
        console.error('getRevenue:', e?.message || e);
        return { total: 0, orders: 0, aov: 0, currency: 'USD', series: [], ok: false };
    }
}

export async function getAnalyticsData(rangeDays = 30): Promise<AnalyticsData> {
    // rangeDays 0 = all-time; cap windowed queries at 365 days so charts stay sane.
    const chartDays = rangeDays === 0 ? 365 : rangeDays;
    // Social account metrics can only window up to 30 days (hard Meta API limit).
    const socialDays = rangeDays === 0 ? 30 : Math.min(rangeDays, 30);
    const sinceIso = rangeDays === 0 ? null : new Date(Date.now() - rangeDays * 86_400_000).toISOString();
    const [ig, fb, threads, web, viewsSeries, pipeline, posts, revenue] = await Promise.all([
        fetchIGDashboardData(socialDays).catch((e) => ({ ...FALLBACK_IG, snapshot: { ...FALLBACK_IG.snapshot, reason: e?.message ?? 'IG fetch failed' } })),
        fetchFacebookSnapshot(socialDays).catch((e) => DEAD_SNAP(e?.message ?? 'FB fetch failed')),
        fetchThreadsSnapshot(socialDays).catch((e) => DEAD_SNAP(e?.message ?? 'Threads fetch failed')),
        fetchWebsiteTraffic(),
        viewsPerDay(chartDays),
        pipelineHistory(30),
        topPostsAndClaims(sinceIso, chartDays),
        getRevenue(chartDays),
    ]);
    const siteViewsRange = viewsSeries.reduce((s, d) => s + d.views, 0);
    return { ig, fb, threads, web, viewsSeries, pipeline, ...posts, revenue, range: rangeDays, socialDays, siteViewsRange };
}
