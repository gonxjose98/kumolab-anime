import fs from 'fs';
import path from 'path';
import { BlogPost } from '@/types';
import { unstable_noStore as noStore } from 'next/cache';
import { supabaseAdmin } from './supabase/admin';

const postsDirectory = path.join(process.cwd(), 'src/data/posts.json');
const USE_SUPABASE = process.env.NEXT_PUBLIC_USE_SUPABASE === 'true';

export async function getPosts(includeHidden: boolean = false): Promise<BlogPost[]> {
    noStore(); // FORCE: Never cache this data fetch in Next.js 15

    if (USE_SUPABASE) {
        let query = supabaseAdmin
            .from('posts')
            .select('*')
            .order('timestamp', { ascending: false });

        if (!includeHidden) {
            // AUTHORITATIVE DB FILTER
            query = query.eq('is_published', true);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[Blog Lib] Supabase fetch error:', error);
            return [];
        }

        // Map snake_case from DB to camelCase for the app
        return (data || [])
            .filter(post => {
                // FAIL-SAFE JS FILTER: Absolutely uncompromising
                if (includeHidden) return true;

                // Ensure egg firm specific post is nuked if it somehow appears
                if (post.title?.includes('Egg Firm')) {
                    if (post.is_published !== true) {
                        console.warn('[SECURITY] Manually blocked Egg Firm leak in JS layer');
                        return false;
                    }
                }

                return post.is_published === true;
            })
            .map(post => {
                const mapped: BlogPost = {
                    ...post,
                    isPublished: post.is_published === true,
                    claimType: post.claim_type,
                    premiereDate: post.premiere_date,
                    truth_fingerprint: post.truth_fingerprint,
                    event_fingerprint: post.event_fingerprint,
                    anime_id: post.anime_id,
                    season_label: post.season_label,
                    status: post.status || (post.is_published ? 'published' : 'pending'),
                    sourceTier: post.source_tier || 3,
                    relevanceScore: post.relevance_score || 0,
                    isDuplicate: post.is_duplicate || false,
                    duplicateOf: post.duplicate_of || null,
                    scrapedAt: post.scraped_at || post.timestamp,
                    source: post.source || 'KumoLab SmartSync'
                };

                // RECONSTRUCTION: If truth_fingerprint is missing from DB (legacy), reconstruct it for local deduplication
                if (!mapped.truth_fingerprint && mapped.anime_id && mapped.claimType) {
                    // We avoid a top-level import to prevent potential circularities with the engine
                    import('./engine/utils').then(({ generateTruthFingerprint }) => {
                        mapped.truth_fingerprint = generateTruthFingerprint({
                            anime_id: mapped.anime_id!,
                            event_type: mapped.claimType!,
                            season_label: mapped.season_label || undefined
                        });
                    }).catch(() => {
                        // Silent fail for reconstruction
                    });
                }

                return mapped;
            })
            // CLEANSE: Ensure strictly serializable data for Next.js Client Components
            .map(p => JSON.parse(JSON.stringify(p)));
    }

    // Local JSON Fallback
    const fileContents = fs.readFileSync(postsDirectory, 'utf8');
    let posts: BlogPost[] = JSON.parse(fileContents);

    if (!includeHidden) {
        posts = posts.filter(p => p.isPublished);
    }

    // Sort by newest first
    return posts.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
}

export async function getPostBySlug(slug: string, includeHidden: boolean = false): Promise<BlogPost | undefined> {
    noStore(); // FORCE: Ensure fresh check

    // ALWAYS fetch with includeHidden = true internally to check for "leaks" or unauthorized access
    const posts = await getPosts(true);
    const post = posts.find((p) => p.slug === slug);

    if (post && !post.isPublished && !includeHidden) {
        console.error(`[CRITICAL SECURITY] Unauthorized attempt to access hidden post: ${slug}`);
        return undefined; // HARSH 404
    }

    return post;
}

export async function getLatestPosts(limit: number = 4, includeHidden: boolean = false): Promise<BlogPost[]> {
    const posts = await getPosts(includeHidden);
    return posts.slice(0, limit);
}
