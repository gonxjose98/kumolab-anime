/**
 * /api/admin/generate-poster
 *
 * Backfill a thumbnail (poster frame) for a video post that has none — e.g.
 * X/IG imports created before posters existed. Extracts a frame from the
 * staged video and stores it in posts.image.
 *
 * Auth: middleware gates /api/admin/* by Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { generateVideoPoster } from '@/lib/social/video-poster';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { postId } = (body || {}) as { postId?: string };
        if (!postId || typeof postId !== 'string') {
            return NextResponse.json({ success: false, error: 'postId is required' }, { status: 400 });
        }

        const { data: post, error: fetchErr } = await supabaseAdmin
            .from('posts')
            .select('id, social_ids')
            .eq('id', postId)
            .single();
        if (fetchErr || !post) {
            return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 });
        }

        const social = (post.social_ids as Record<string, any>) || {};
        const videoUrl: string | undefined = social.staged_video_url || social.original_video_url;
        if (!videoUrl) {
            return NextResponse.json({ success: false, error: 'No staged video on this post' }, { status: 400 });
        }
        const duration = Number(social.import_duration_seconds) || undefined;

        const posterUrl = await generateVideoPoster(videoUrl, postId, duration);
        if (!posterUrl) {
            return NextResponse.json({ success: false, error: 'Poster extraction failed' }, { status: 502 });
        }

        const { error: updErr } = await supabaseAdmin
            .from('posts')
            .update({ image: posterUrl })
            .eq('id', postId);
        if (updErr) {
            return NextResponse.json({ success: false, error: `DB update failed: ${updErr.message}` }, { status: 500 });
        }

        return NextResponse.json({ success: true, image: posterUrl });
    } catch (e: any) {
        console.error('[generate-poster] error', e);
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
