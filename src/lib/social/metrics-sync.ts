// Per-post social metrics sync — Instagram + Facebook + Threads.
//
// Every published post stores the platform ids it was broadcast to in
// `posts.social_ids` (instagram_id, facebook_id, threads_id). This pulls each
// post's real numbers from the Meta Graph API (IG + FB) and the Threads API and
// writes them to `posts.social_metrics.{instagram,facebook,threads}`, the shape
// the analytics dashboard reads.
//
// Best-effort + rate-limit aware: a Meta rate-limit stops cleanly; a deleted /
// inaccessible post is counted as a miss and skipped. Safe to run repeatedly —
// posts missing the newest platform metrics are filled first, so successive runs
// backfill the whole history while keeping recent posts fresh.

import { supabaseAdmin } from '@/lib/supabase/admin';

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;
// v22.0 unified `plays` (Reels) + `impressions` (image/carousel) into `views`.
const GRAPH = 'https://graph.facebook.com/v22.0';
const THREADS = 'https://graph.threads.net/v1.0';

export interface PostMetrics {
    views: number;
    reach: number;
    likes: number;
    comments: number;
    synced_at: string;
}

export interface MetricsSyncResult {
    ok: boolean;
    reason?: string;
    scanned: number; // posts considered this run
    synced: number; // posts with at least one platform updated
    failed: number; // posts where no platform could be fetched
    rateLimited: boolean;
    remaining: number; // posts still missing some platform metric after this run
    byPlatform: { instagram: number; facebook: number; threads: number };
}

// Meta error codes that mean "you're being throttled" — stop and let the
// operator retry later rather than hammering and getting the token flagged.
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
class RateLimitError extends Error {}

interface Row {
    id: string;
    instagram_id?: string;
    facebook_id?: string;
    threads_id?: string;
    social_metrics: Record<string, any>;
}

// ── Instagram ───────────────────────────────────────────────────────────────
async function fetchOneIG(mediaId: string): Promise<PostMetrics | null> {
    const fRes = await fetch(`${GRAPH}/${mediaId}?fields=like_count,comments_count,media_product_type,media_type&access_token=${META_ACCESS_TOKEN}`, { cache: 'no-store' });
    const fData = await fRes.json();
    if (fData.error) {
        if (RATE_LIMIT_CODES.has(fData.error.code)) throw new RateLimitError(fData.error.message);
        return null;
    }
    const likes = Number(fData.like_count || 0);
    const comments = Number(fData.comments_count || 0);
    const isReel = fData.media_product_type === 'REELS' || fData.media_type === 'VIDEO';

    const tryMetrics = async (metrics: string) => {
        const r = await fetch(`${GRAPH}/${mediaId}/insights?metric=${metrics}&access_token=${META_ACCESS_TOKEN}`, { cache: 'no-store' });
        const j = await r.json();
        if (j.error) {
            if (RATE_LIMIT_CODES.has(j.error.code)) throw new RateLimitError(j.error.message);
            return { ok: false, views: 0, reach: 0 };
        }
        let views = 0, reach = 0;
        if (Array.isArray(j?.data)) for (const row of j.data) {
            const val = row?.values?.[0]?.value ?? row?.total_value?.value ?? 0;
            if (row.name === 'reach') reach = Number(val) || 0;
            if (row.name === 'views' || row.name === 'plays' || row.name === 'impressions') views = Number(val) || 0;
        }
        return { ok: true, views, reach };
    };
    let ins = await tryMetrics('views,reach');
    if (!ins.ok) ins = await tryMetrics(isReel ? 'plays,reach' : 'impressions,reach');
    return { views: ins.views, reach: ins.reach, likes, comments, synced_at: new Date().toISOString() };
}

// ── Facebook Page post ───────────────────────────────────────────────────────
async function fetchOneFB(postId: string): Promise<PostMetrics | null> {
    // Engagement via the post's summary edges (reliable across post types).
    const fRes = await fetch(`${GRAPH}/${postId}?fields=likes.summary(true),comments.summary(true),shares&access_token=${META_ACCESS_TOKEN}`, { cache: 'no-store' });
    const fData = await fRes.json();
    if (fData.error) {
        if (RATE_LIMIT_CODES.has(fData.error.code)) throw new RateLimitError(fData.error.message);
        return null;
    }
    const likes = Number(fData.likes?.summary?.total_count || 0);
    const comments = Number(fData.comments?.summary?.total_count || 0);
    const shares = Number(fData.shares?.count || 0);

    // Reach/views via post insights — availability varies by post type, so this
    // is best-effort and degrades to 0.
    let views = 0, reach = 0;
    try {
        const r = await fetch(`${GRAPH}/${postId}/insights?metric=post_impressions,post_impressions_unique&access_token=${META_ACCESS_TOKEN}`, { cache: 'no-store' });
        const j = await r.json();
        if (!j.error && Array.isArray(j?.data)) for (const row of j.data) {
            const val = row?.values?.[0]?.value ?? 0;
            if (row.name === 'post_impressions') views = Number(val) || 0;
            if (row.name === 'post_impressions_unique') reach = Number(val) || 0;
        }
    } catch { /* leave 0 */ }
    // Fold shares into comments so engagement (likes + comments) reflects shares too.
    return { views, reach, likes, comments: comments + shares, synced_at: new Date().toISOString() };
}

// ── Threads post ──────────────────────────────────────────────────────────────
async function fetchOneThreads(mediaId: string): Promise<PostMetrics | null> {
    const r = await fetch(`${THREADS}/${mediaId}/insights?metric=views,likes,replies,reposts,quotes&access_token=${THREADS_ACCESS_TOKEN}`, { cache: 'no-store' });
    const j = await r.json();
    if (j.error) {
        if (RATE_LIMIT_CODES.has(j.error?.code)) throw new RateLimitError(j.error.message);
        return null;
    }
    const by: Record<string, number> = {};
    if (Array.isArray(j?.data)) for (const row of j.data) {
        by[row.name] = Number(row?.values?.[0]?.value ?? row?.total_value?.value ?? 0) || 0;
    }
    // replies ≈ comments; fold reposts + quotes into comments so they count as engagement.
    const comments = (by.replies || 0) + (by.reposts || 0) + (by.quotes || 0);
    return { views: by.views || 0, reach: 0, likes: by.likes || 0, comments, synced_at: new Date().toISOString() };
}

/** Run tasks with a fixed concurrency cap. */
async function pooled<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
    let i = 0;
    const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
        while (i < items.length) await worker(items[i++]);
    });
    await Promise.all(runners);
}

/**
 * Sync IG + FB + Threads metrics for up to `limit` published posts. Posts still
 * missing a platform's metrics are prioritized (newest-first), so repeated runs
 * backfill everything while keeping recent posts fresh.
 */
export async function syncSocialMetrics(limit = 100): Promise<MetricsSyncResult> {
    const base: MetricsSyncResult = { ok: false, scanned: 0, synced: 0, failed: 0, rateLimited: false, remaining: 0, byPlatform: { instagram: 0, facebook: 0, threads: 0 } };
    if (!META_ACCESS_TOKEN && !THREADS_ACCESS_TOKEN) return { ...base, reason: 'META_ACCESS_TOKEN and THREADS_ACCESS_TOKEN both missing' };

    const { data, error } = await supabaseAdmin
        .from('posts')
        .select('id, social_ids, social_metrics')
        .eq('status', 'published')
        .or('social_ids->>instagram_id.not.is.null,social_ids->>facebook_id.not.is.null,social_ids->>threads_id.not.is.null')
        .order('published_at', { ascending: false })
        .limit(1500);
    if (error) return { ...base, reason: `posts query: ${error.message}` };

    const all: Row[] = (data || []).map((p: any) => ({
        id: p.id,
        instagram_id: p.social_ids?.instagram_id,
        facebook_id: p.social_ids?.facebook_id,
        threads_id: p.social_ids?.threads_id,
        social_metrics: p.social_metrics || {},
    }));

    // A post "needs work" if it's missing metrics for a platform whose per-post
    // API reliably returns data (Instagram, Threads). Facebook is best-effort
    // only — page-post reads often aren't permitted for this token, so it must
    // NOT gate convergence, otherwise every FB post stays "needs work" forever
    // and the sync re-scans the whole history on every run. FB is still attempted
    // opportunistically below (it may succeed with a page-scoped token in prod).
    const needs = (r: Row) =>
        (r.instagram_id && META_ACCESS_TOKEN && !r.social_metrics.instagram) ||
        (r.threads_id && THREADS_ACCESS_TOKEN && !r.social_metrics.threads);
    const missing = all.filter(needs);
    const rest = all.filter((r) => !needs(r));
    const queue = [...missing, ...rest].slice(0, limit);

    let synced = 0, failed = 0, rateLimited = false;
    const byPlatform = { instagram: 0, facebook: 0, threads: 0 };

    await pooled(queue, 5, async (row) => {
        if (rateLimited) return;
        const metrics: Record<string, any> = { ...(row.social_metrics || {}) };
        let touched = false;

        const runOne = async (platform: 'instagram' | 'facebook' | 'threads', fn: () => Promise<PostMetrics | null>) => {
            if (rateLimited) return;
            try {
                const m = await fn();
                if (m) { metrics[platform] = m; byPlatform[platform]++; touched = true; }
            } catch (e) {
                if (e instanceof RateLimitError) rateLimited = true;
            }
        };

        if (row.instagram_id && META_ACCESS_TOKEN) await runOne('instagram', () => fetchOneIG(row.instagram_id!));
        if (row.facebook_id && META_ACCESS_TOKEN) await runOne('facebook', () => fetchOneFB(row.facebook_id!));
        if (row.threads_id && THREADS_ACCESS_TOKEN) await runOne('threads', () => fetchOneThreads(row.threads_id!));

        if (!touched) { failed++; return; }
        const { error: upErr } = await supabaseAdmin.from('posts').update({ social_metrics: metrics }).eq('id', row.id);
        if (upErr) failed++; else synced++;
    });

    const remaining = Math.max(0, missing.length - synced);
    return {
        ok: true,
        scanned: queue.length,
        synced,
        failed,
        rateLimited,
        remaining,
        byPlatform,
        reason: rateLimited ? 'Meta rate limit hit — run again in a few minutes to continue.' : undefined,
    };
}
