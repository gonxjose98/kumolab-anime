import { BlogPost } from '@/types';
import { supabaseAdmin } from './supabase/admin';

// Bound every full-list read. With retention on (default 60d) the posts table
// stays small, but under an evergreen config it grows without limit — and the
// old `select('*')` with no cap ran the WHOLE table on every page view, so the
// cost scaled with traffic × archive size (the exact viral-Reel scenario).
// 500 newest posts is far more than any feed shows.
const DEFAULT_LIST_LIMIT = 500;

/** Map a raw Supabase row to the BlogPost shape the UI/engine expect. */
function mapPost(post: any): BlogPost {
    const mapped: BlogPost = {
        ...post,
        isPublished: post.is_published === true,
        claimType: post.claim_type,
        anime_id: post.anime_id,
        status: post.status || (post.is_published ? 'published' : 'pending'),
        sourceTier: post.source_tier || 3,
        scrapedAt: post.timestamp,
        source: post.source || 'KumoLab SmartSync',
    };
    // Strip any non-plain values (Dates etc.) so this is safe to pass to Client Components.
    return JSON.parse(JSON.stringify(mapped));
}

export async function getPosts(includeHidden: boolean = false, limit: number = DEFAULT_LIST_LIMIT): Promise<BlogPost[]> {
    let query = supabaseAdmin
        .from('posts')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

    if (!includeHidden) {
        query = query.eq('is_published', true);
    }

    const { data, error } = await query;

    if (error) {
        console.error('[Blog Lib] Supabase fetch error:', error);
        return [];
    }

    return (data || [])
        .filter(post => includeHidden || post.is_published === true)
        .map(mapPost);
}

export async function getPostBySlug(slug: string, includeHidden: boolean = false): Promise<BlogPost | undefined> {
    // Point lookup — previously this fetched the ENTIRE posts table and
    // `.find()`'d one row, so an article page (where all social clickthrough
    // lands) ran two full-table scans per view (metadata + body).
    const { data, error } = await supabaseAdmin
        .from('posts')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();

    if (error) {
        console.error('[Blog Lib] Supabase fetch error (slug):', error);
        return undefined;
    }
    if (!data) return undefined;

    const post = mapPost(data);

    if (!post.isPublished && !includeHidden) {
        console.error(`[CRITICAL SECURITY] Unauthorized attempt to access hidden post: ${slug}`);
        return undefined;
    }

    return post;
}

export async function getLatestPosts(limit: number = 4, includeHidden: boolean = false): Promise<BlogPost[]> {
    return getPosts(includeHidden, limit);
}

/**
 * Looks up a redirect target for a slug whose post has been deleted under Fork-2 retention.
 * Returns null if no redirect is recorded — caller should 404.
 */
export async function getExpiredRedirect(slug: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin
        .from('expired_redirects')
        .select('redirect_url')
        .eq('slug', slug)
        .maybeSingle();

    if (error || !data) return null;
    return data.redirect_url || null;
}
