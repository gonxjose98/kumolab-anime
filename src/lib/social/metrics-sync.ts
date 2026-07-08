// Per-post social metrics sync.
//
// Every published post stores the platform ids it was broadcast to in
// `posts.social_ids` (instagram_id, facebook_id, …). But `posts.social_metrics`
// was never populated, so the analytics "Social" column is empty. This pulls
// each post's real Instagram numbers (views, reach, likes, comments) from the
// Meta Graph API and writes them back to `social_metrics.instagram`, the exact
// shape the analytics dashboard already reads.
//
// Best-effort + rate-limit aware: a Meta rate-limit or a deleted-media error
// stops cleanly and reports, rather than throwing. Safe to run repeatedly —
// posts still missing metrics are filled first, so successive runs backfill the
// whole history in chunks while also refreshing the most recent posts.

import { supabaseAdmin } from '@/lib/supabase/admin';

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
// v22.0 unified `plays` (Reels) + `impressions` (image/carousel) into `views`.
const GRAPH = 'https://graph.facebook.com/v22.0';

export interface IGPostMetrics {
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
    synced: number; // posts successfully updated
    failed: number; // posts whose insights couldn't be fetched
    rateLimited: boolean;
    remaining: number; // published IG posts still without metrics after this run
}

// Meta error codes that mean "you're being throttled" — stop and let the
// operator retry later rather than hammering and getting the token flagged.
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

interface Row {
    id: string;
    instagram_id: string;
    social_metrics: Record<string, any> | null;
}

/**
 * Fetch one IG media's numbers. Returns null if Meta rejects the media (deleted
 * / not insights-eligible) — the caller counts it as failed but keeps going.
 * Throws only on a rate-limit code so the batch loop can halt cleanly.
 */
async function fetchOneIG(mediaId: string): Promise<IGPostMetrics | null> {
    // 1) Static engagement fields (likes, comments) live on the media node.
    const fieldsUrl = `${GRAPH}/${mediaId}?fields=like_count,comments_count,media_product_type,media_type&access_token=${META_ACCESS_TOKEN}`;
    const fRes = await fetch(fieldsUrl, { cache: 'no-store' });
    const fData = await fRes.json();
    if (fData.error) {
        if (RATE_LIMIT_CODES.has(fData.error.code)) throw new RateLimitError(fData.error.message);
        return null; // deleted / inaccessible media
    }

    const likes = Number(fData.like_count || 0);
    const comments = Number(fData.comments_count || 0);
    const isReel = fData.media_product_type === 'REELS' || fData.media_type === 'VIDEO';

    // 2) Insights (views, reach). `views,reach` works on modern media; fall
    //    back to the legacy per-type metric names for older posts.
    const tryMetrics = async (metrics: string): Promise<{ ok: boolean; views: number; reach: number }> => {
        const r = await fetch(`${GRAPH}/${mediaId}/insights?metric=${metrics}&access_token=${META_ACCESS_TOKEN}`, { cache: 'no-store' });
        const j = await r.json();
        if (j.error) {
            if (RATE_LIMIT_CODES.has(j.error.code)) throw new RateLimitError(j.error.message);
            return { ok: false, views: 0, reach: 0 };
        }
        let views = 0;
        let reach = 0;
        if (Array.isArray(j?.data)) {
            for (const row of j.data) {
                const val = row?.values?.[0]?.value ?? row?.total_value?.value ?? 0;
                if (row.name === 'reach') reach = Number(val) || 0;
                if (row.name === 'views' || row.name === 'plays' || row.name === 'impressions') views = Number(val) || 0;
            }
        }
        return { ok: true, views, reach };
    };

    let ins = await tryMetrics('views,reach');
    if (!ins.ok) ins = await tryMetrics(isReel ? 'plays,reach' : 'impressions,reach');

    return { views: ins.views, reach: ins.reach, likes, comments, synced_at: new Date().toISOString() };
}

class RateLimitError extends Error {}

/** Run tasks with a fixed concurrency cap. */
async function pooled<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
    let i = 0;
    const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
        while (i < items.length) {
            const idx = i++;
            await worker(items[idx]);
        }
    });
    await Promise.all(runners);
}

/**
 * Sync Instagram metrics for up to `limit` published posts. Posts still missing
 * metrics are prioritized (newest-first), so repeated runs backfill everything
 * while keeping recent posts fresh.
 */
export async function syncSocialMetrics(limit = 100): Promise<MetricsSyncResult> {
    const base: MetricsSyncResult = { ok: false, scanned: 0, synced: 0, failed: 0, rateLimited: false, remaining: 0 };
    if (!META_ACCESS_TOKEN) return { ...base, reason: 'META_ACCESS_TOKEN missing' };

    // Prioritize posts with no metrics yet (empty jsonb), newest first.
    const { data, error } = await supabaseAdmin
        .from('posts')
        .select('id, social_ids, social_metrics')
        .eq('status', 'published')
        .not('social_ids->>instagram_id', 'is', null)
        .order('published_at', { ascending: false })
        .limit(1500);
    if (error) return { ...base, reason: `posts query: ${error.message}` };

    const all: Row[] = (data || [])
        .map((p: any) => ({ id: p.id, instagram_id: p.social_ids?.instagram_id, social_metrics: p.social_metrics || {} }))
        .filter((r: Row) => !!r.instagram_id);

    const missing = all.filter((r) => !r.social_metrics?.instagram);
    const present = all.filter((r) => r.social_metrics?.instagram);
    // Fill gaps first, then refresh recent already-synced posts with leftover budget.
    const queue = [...missing, ...present].slice(0, limit);

    let synced = 0;
    let failed = 0;
    let rateLimited = false;

    try {
        await pooled(queue, 5, async (row) => {
            if (rateLimited) return; // stop dispatching once we hit a limit
            let metrics: IGPostMetrics | null;
            try {
                metrics = await fetchOneIG(row.instagram_id);
            } catch (e) {
                if (e instanceof RateLimitError) { rateLimited = true; return; }
                failed++;
                return;
            }
            if (!metrics) { failed++; return; }
            const merged = { ...(row.social_metrics || {}), instagram: metrics };
            const { error: upErr } = await supabaseAdmin.from('posts').update({ social_metrics: merged }).eq('id', row.id);
            if (upErr) failed++;
            else synced++;
        });
    } catch {
        // pooled itself never throws for per-item errors; guard anyway.
    }

    const remaining = Math.max(0, missing.length - synced);
    return {
        ok: true,
        scanned: queue.length,
        synced,
        failed,
        rateLimited,
        remaining,
        reason: rateLimited ? 'Meta rate limit hit — run again in a few minutes to continue.' : undefined,
    };
}
