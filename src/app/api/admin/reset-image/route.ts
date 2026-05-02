import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { selectBestImage } from '@/lib/engine/image-selector';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Returns a clean source image URL for a post — used by the editor to
// recover from posts whose post.image got baked with an overlay (either
// from older code paths that auto-persisted renders, or from the
// publisher having already rendered the image).
//
// Strategy:
//   1. YouTube post → CDN thumbnail at maxresdefault (always clean).
//   2. Otherwise → call selectBestImage with the post's title + claim type
//      to get a fresh AniList/Crunchyroll/etc. cover URL.
//
// This endpoint does NOT mutate posts.image. It just returns a URL the
// editor can pass to the render endpoint as `sourceUrl`. Persistence still
// only happens on Save.
export async function POST(req: NextRequest) {
    try {
        const { postId } = await req.json();
        if (!postId || typeof postId !== 'string') {
            return NextResponse.json({ success: false, error: 'postId is required' }, { status: 400 });
        }

        const { data: post, error: fetchError } = await supabaseAdmin
            .from('posts')
            .select('id, title, claim_type, youtube_video_id')
            .eq('id', postId)
            .single();

        if (fetchError || !post) {
            return NextResponse.json({ success: false, error: fetchError?.message || 'Post not found' }, { status: 404 });
        }

        if (post.youtube_video_id) {
            return NextResponse.json({
                success: true,
                url: `https://img.youtube.com/vi/${post.youtube_video_id}/maxresdefault.jpg`,
                source: 'youtube_cdn',
            });
        }

        const found = await selectBestImage(post.title || '', post.claim_type || 'General');
        if (!found?.url) {
            return NextResponse.json(
                { success: false, error: 'No clean source could be found for this post. Try uploading your own image instead.' },
                { status: 404 },
            );
        }

        return NextResponse.json({ success: true, url: found.url, source: 'image_selector' });
    } catch (e: any) {
        console.error('[admin/reset-image] error', e);
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
