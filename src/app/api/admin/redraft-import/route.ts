/**
 * /api/admin/redraft-import
 *
 * Regenerate an imported post's title + caption with the current AI prompts,
 * without re-downloading the video. Used to re-draft existing X/IG imports
 * after a prompt change (e.g. moving from news framing to highlight-clip
 * framing). Uses the stored social_ids.original_text when present, otherwise
 * re-fetches the source post text from the worker.
 *
 * Auth: middleware gates /api/admin/* by Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { detectSocialPlatform, fetchSocialPostText } from '@/lib/social/social-video-fetcher';
import { draftImportedPost } from '@/lib/engine/ai-import-draft';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { postId, notes } = (body || {}) as { postId?: string; notes?: string };
        if (!postId || typeof postId !== 'string') {
            return NextResponse.json({ success: false, error: 'postId is required' }, { status: 400 });
        }

        const { data: post, error: fetchErr } = await supabaseAdmin
            .from('posts')
            .select('id, source_url, social_ids')
            .eq('id', postId)
            .single();
        if (fetchErr || !post) {
            return NextResponse.json({ success: false, error: 'Post not found' }, { status: 404 });
        }

        const sourceUrl = (post.source_url || '') as string;
        const platform = detectSocialPlatform(sourceUrl) || 'x';
        const social = (post.social_ids as Record<string, any>) || {};

        // Prefer the stored original text; re-fetch from the worker only if
        // this import predates original_text storage.
        let originalText = (social.original_text || '').toString();
        if (!originalText.trim() && sourceUrl) {
            originalText = await fetchSocialPostText(sourceUrl);
        }

        const draft = await draftImportedPost({
            platform,
            originalText,
            userNotes: typeof notes === 'string' ? notes : '',
        });

        const captionTrimmed = draft.caption.slice(0, 5000);
        const { error: updErr } = await supabaseAdmin
            .from('posts')
            .update({
                title: draft.title,
                content: draft.caption,
                excerpt: captionTrimmed.slice(0, 280),
                social_ids: { ...social, original_text: originalText.slice(0, 2000) },
            })
            .eq('id', postId);
        if (updErr) {
            return NextResponse.json({ success: false, error: `DB update failed: ${updErr.message}` }, { status: 500 });
        }

        return NextResponse.json({ success: true, title: draft.title, caption: draft.caption });
    } catch (e: any) {
        console.error('[redraft-import] error', e);
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
