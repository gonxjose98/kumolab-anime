// Curated, resilient audience numbers for the public-facing media kit
// (/media-kit). Reuses the same live fetchers the admin analytics dashboard
// uses, but returns only the sponsor-relevant subset and never throws — any
// upstream failure degrades that one metric to null so the page can omit it
// rather than show a zero. Cached at the page level via ISR (revalidate 1h),
// so this only hits Meta/Supabase a couple of times an hour, not per view.

import { fetchIGDashboardData } from '@/lib/social/ig-insights';
import { fetchFacebookSnapshot, fetchThreadsSnapshot } from '@/lib/social/social-insights';
import { fetchWebsiteTraffic } from '@/lib/analytics/page-views';
import { supabaseAdmin } from '@/lib/supabase/admin';

export interface MediaKitReel {
    title: string;
    link: string;        // on-site post (/blog/<slug>) — IG stores no permalink
    thumbnail: string | null;
    views: number;
    likes: number;
    comments: number;
}

export interface MediaKitData {
    // audience
    igFollowers: number | null;
    fbFollowers: number | null;
    threadsFollowers: number | null;
    combinedFollowers: number | null;
    // 30-day reach/engagement (Instagram — the reach engine)
    views30d: number | null;
    reach30d: number | null;
    accountsEngaged30d: number | null;
    interactions30d: number | null;
    profileViews30d: number | null;
    // owned channels
    websiteViews30d: number | null;
    // output
    postsPer30d: number | null;
    // proof
    topReels: MediaKitReel[];
    // meta
    live: boolean; // true when the Instagram snapshot came back OK
}

/** Trim an IG caption down to a one-line headline for the proof grid. */
function reelTitle(caption: string): string {
    const firstLine = (caption || '').split('\n').map((l) => l.trim()).find(Boolean) || 'KumoLab Reel';
    // Strip hashtags/mentions clusters, collapse whitespace, cap length.
    const clean = firstLine.replace(/#\w+/g, '').replace(/\s+/g, ' ').trim();
    return clean.length > 72 ? clean.slice(0, 69).trimEnd() + '…' : clean || 'KumoLab Reel';
}

/**
 * Genuine top-performing posts by stored lifetime Instagram views. metrics-sync
 * writes per-post lifetime insights into posts.social_metrics, so this surfaces
 * real breakouts (tens of thousands of views) rather than IG's most-recent 8.
 * Ordering by nested JSON in PostgREST sorts as text, so we pull a batch and
 * rank in JS (same pattern as the analytics dashboard). Links go on-site since
 * IG stores no permalink.
 */
async function topReelsFromPosts(limit = 6): Promise<MediaKitReel[]> {
    try {
        const { data, error } = await supabaseAdmin
            .from('posts')
            .select('title, slug, image, social_metrics')
            .eq('status', 'published')
            .not('social_metrics->instagram', 'is', null)
            .order('published_at', { ascending: false })
            .limit(400);
        if (error || !data) return [];
        return data
            .map((p: any) => {
                const ig = p.social_metrics?.instagram || {};
                return {
                    title: reelTitle(p.title || ''),
                    link: `/blog/${p.slug}`,
                    thumbnail: p.image || null,
                    views: Number(ig.views || 0),
                    likes: Number(ig.likes || 0),
                    comments: Number(ig.comments || 0),
                };
            })
            .filter((r) => r.views > 0)
            .sort((a, b) => b.views - a.views)
            .slice(0, limit);
    } catch {
        return [];
    }
}

/** Count posts published in the last N days (published-status posts on the site). */
async function postsPublishedLast(days = 30): Promise<number | null> {
    try {
        const since = new Date(Date.now() - days * 86_400_000).toISOString();
        const { count, error } = await supabaseAdmin
            .from('posts')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'published')
            .gte('published_at', since);
        if (error) return null;
        return count ?? null;
    } catch {
        return null;
    }
}

export async function getMediaKitData(): Promise<MediaKitData> {
    const [ig, fb, threads, web, postsPer30d, storedReels] = await Promise.all([
        fetchIGDashboardData(30).catch(() => null),
        fetchFacebookSnapshot(30).catch(() => null),
        fetchThreadsSnapshot(30).catch(() => null),
        fetchWebsiteTraffic().catch(() => null),
        postsPublishedLast(30),
        topReelsFromPosts(6),
    ]);

    const snap = ig?.snapshot;
    const igFollowers = snap?.followers ?? null;
    const fbFollowers = fb?.followers ?? null;
    const threadsFollowers = threads?.followers ?? null;
    const combinedFollowers =
        [igFollowers, fbFollowers, threadsFollowers].some((n) => n != null)
            ? [igFollowers, fbFollowers, threadsFollowers].reduce<number>((s, n) => s + (n || 0), 0)
            : null;

    // Prefer genuine all-time top performers (stored lifetime metrics); fall
    // back to IG's most-recent media only when no stored metrics exist yet.
    const topReels: MediaKitReel[] = storedReels.length > 0
        ? storedReels
        : (ig?.topRecent || [])
            .filter((m) => (m.views || 0) > 0)
            .sort((a, b) => (b.views || 0) - (a.views || 0))
            .slice(0, 6)
            .map((m) => ({
                title: reelTitle(m.caption),
                link: m.permalink,
                thumbnail: m.thumbnail,
                views: m.views || 0,
                likes: m.likes || 0,
                comments: m.comments || 0,
            }));

    return {
        igFollowers,
        fbFollowers,
        threadsFollowers,
        combinedFollowers,
        views30d: snap?.views28d ?? null,
        reach30d: snap?.reach28d ?? null,
        accountsEngaged30d: snap?.accountsEngaged28d ?? null,
        interactions30d: snap?.totalInteractions28d ?? null,
        profileViews30d: snap?.profileViews28d ?? null,
        websiteViews30d: web?.ok ? web.views30d : null,
        postsPer30d,
        topReels,
        live: !!snap?.ok,
    };
}
