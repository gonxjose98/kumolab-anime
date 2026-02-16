
import { BlogPost } from '../src/types';
import { supabaseAdmin } from '../src/lib/supabase/admin';

export async function publishPostDirect(post: BlogPost) {
    const { error } = await supabaseAdmin
        .from('posts')
        .upsert([{
            title: post.title,
            slug: post.slug,
            type: post.type,
            content: post.content,
            image: post.image,
            timestamp: post.timestamp,
            is_published: post.isPublished,
            claim_type: post.claimType,
            premiere_date: post.premiereDate,
            event_fingerprint: post.event_fingerprint,
            anime_id: post.anime_id,
            season_label: post.season_label,
            verification_tier: post.verification_tier,
            verification_reason: post.verification_reason,
            verification_sources: post.verification_sources
        }], { onConflict: 'slug' });

    if (error) {
        console.error('Publish error:', error);
        throw error;
    }
}
