/**
 * /api/admin/studio/finalize
 *
 * After the browser exports the reel and uploads it to the blog-videos bucket
 * (via /api/admin/upload-sign), this points the post at that file:
 *   - social_ids.staged_video_url = publicUrl   (what the publisher sends)
 *   - social_ids.original_video_url = publicUrl  (only if not already set —
 *     preserves the immutable import as the recoverable source)
 *   - image_settings.video_project = projectJson (re-editable edit description)
 *   - image_settings.edited_by / edited_by_email = who finalized (INTERNAL
 *     label only — no publisher reads it) + a studio_activity row
 *     (kind='video', action='finalize') for the per-user counts.
 *
 * The entire IG/FB/Threads/TikTok/YouTube publish pipeline is unchanged — it
 * only reads staged_video_url. Uses supabaseAdmin (service role); auth is
 * enforced by middleware on /api/admin/*.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getStudioActor, recordStudioActivity } from '@/lib/auth/studio-actor';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const postId = body?.postId != null ? String(body.postId) : '';
        const publicUrl = typeof body?.publicUrl === 'string' ? body.publicUrl : '';
        const projectJson = body?.project;
        const durationSec = Number(body?.durationSec) || null;
        if (!postId || !publicUrl) {
            return NextResponse.json({ success: false, error: 'postId and publicUrl are required' }, { status: 400 });
        }

        const { data: existing, error: readErr } = await supabaseAdmin
            .from('posts').select('social_ids, image_settings').eq('id', postId).single();
        if (readErr) return NextResponse.json({ success: false, error: readErr.message }, { status: 404 });

        const social_ids = { ...(existing?.social_ids || {}) };
        social_ids.staged_video_url = publicUrl;
        if (!social_ids.original_video_url) social_ids.original_video_url = publicUrl;

        const image_settings = { ...(existing?.image_settings || {}) };
        if (projectJson) image_settings.video_project = projectJson;
        if (durationSec) image_settings.video_duration = durationSec;

        // Internal attribution: who produced this export. Best-effort — a
        // missing session (shouldn't happen from the browser) just skips it.
        const actor = await getStudioActor();
        if (actor) {
            image_settings.edited_by = actor.name;
            image_settings.edited_by_email = actor.email;
        }

        const { error } = await supabaseAdmin
            .from('posts').update({ social_ids, image_settings }).eq('id', postId);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

        // Count the export (finalize = one produced video). Autosaves and
        // preview renders never reach this route, so counts stay honest.
        if (actor) await recordStudioActivity(actor, postId, 'video', 'finalize');

        return NextResponse.json({ success: true, staged_video_url: publicUrl });
    } catch (e: any) {
        console.error('[studio/finalize] error', e);
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
