import { BlogPost } from '@/types';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin } from './supabase/admin';

export async function getPosts(includeHidden: boolean = false): Promise<BlogPost[]> {
    noStore();

    let query = supabaseAdmin
        .from('posts')
        .select('*')
        .order('timestamp', { ascending: false });

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
        .map(post => {
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
            return mapped;
        })
        .map(p => JSON.parse(JSON.stringify(p)));
}

export async function getPostBySlug(slug: string, includeHidden: boolean = false): Promise<BlogPost | undefined> {
    noStore();

    const posts = await getPosts(true);
    const post = posts.find(p => p.slug === slug);

    if (post && !post.isPublished && !includeHidden) {
        console.error(`[CRITICAL SECURITY] Unauthorized attempt to access hidden post: ${slug}`);
        return undefined;
    }

    return post;
}

export async function getLatestPosts(limit: number = 4, includeHidden: boolean = false): Promise<BlogPost[]> {
    const posts = await getPosts(includeHidden);
    return posts.slice(0, limit);
}

/**
 * Looks up a redirect target for a slug whose post has been deleted under Fork-2 retention.
 * Returns null if no redirect is recorded — caller should 404.
 */
export async function getExpiredRedirect(slug: string): Promise<string | null> {
    noStore();

    const { data, error } = await supabaseAdmin
        .from('expired_redirects')
        .select('redirect_url')
        .eq('slug', slug)
        .maybeSingle();

    if (error || !data) return null;
    return data.redirect_url || null;
}
