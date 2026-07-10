/**
 * /api/admin/studio/duplicate
 *
 * "Make a draft copy" (Jose, 2026-07-10): when you open already-scheduled or
 * published content from the Studio Library to rework it, we never touch the
 * live original — we clone it into a fresh draft and open that instead.
 *
 * The copy carries over everything you'd want to keep editing (title, caption,
 * image, video assets in social_ids, the re-editable image_settings/video_project)
 * but resets anything schedule/publish/metrics related, so it's a clean draft.
 *
 * Uses supabaseAdmin (service role). Auth enforced by middleware on /api/admin/*.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const postId = body?.postId != null ? String(body.postId) : '';
        if (!postId) return NextResponse.json({ success: false, error: 'postId is required' }, { status: 400 });

        const { data: src, error: readErr } = await supabaseAdmin
            .from('posts')
            .select('slug, title, content, excerpt, image, type, claim_type, anime_id, source, source_url, source_tier, social_ids, image_settings, hashtags, youtube_video_id, youtube_url, youtube_embed_url')
            .eq('id', postId)
            .maybeSingle();

        if (readErr || !src) {
            return NextResponse.json({ success: false, error: readErr?.message || 'Post not found' }, { status: 404 });
        }

        const now = new Date().toISOString();
        const image_settings = { ...((src.image_settings as Record<string, any>) || {}), studio_edited_at: now };

        const draft = {
            slug: `${src.slug || 'post'}-d${randomUUID().slice(0, 6)}`, // unique
            title: src.title,
            content: src.content,
            excerpt: src.excerpt,
            image: src.image,
            type: src.type || 'INTEL',
            claim_type: src.claim_type,
            anime_id: src.anime_id,
            source: src.source,
            source_url: src.source_url,
            source_tier: src.source_tier,
            social_ids: src.social_ids || {}, // carries staged_video_url / original_video_url
            social_metrics: {},               // fresh draft: no inherited metrics
            image_settings,                    // carries video_project + overlay edits
            hashtags: src.hashtags,
            youtube_video_id: src.youtube_video_id,
            youtube_url: src.youtube_url,
            youtube_embed_url: src.youtube_embed_url,
            status: 'draft',
            is_published: false,
            // scheduled_post_time / approved_* / published_at / expires_at left at defaults (null)
        };

        const { data: inserted, error: insErr } = await supabaseAdmin
            .from('posts').insert([draft]).select('id, social_ids').single();
        if (insErr || !inserted) {
            return NextResponse.json({ success: false, error: insErr?.message || 'Copy failed' }, { status: 500 });
        }

        const kind = (inserted.social_ids as any)?.staged_video_url ? 'video' : 'image';
        return NextResponse.json({ success: true, id: inserted.id, kind });
    } catch (e: any) {
        console.error('[studio/duplicate] error', e);
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
