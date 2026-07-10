/**
 * /api/admin/studio/save-project
 *
 * Autosave the Studio edit description (the serializable VideoProject) into
 * posts.image_settings.video_project so an edit is always re-openable. This
 * does NOT touch the published output — that's `finalize` after export.
 *
 * Uses supabaseAdmin (service role) because /api/posts PUT's allowedFields
 * excludes image_settings. Auth is enforced by middleware on /api/admin/*.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const postId = body?.postId != null ? String(body.postId) : '';
        const project = body?.project;
        if (!postId) return NextResponse.json({ success: false, error: 'postId is required' }, { status: 400 });
        if (!project || typeof project !== 'object') {
            return NextResponse.json({ success: false, error: 'project is required' }, { status: 400 });
        }

        const { data: existing, error: readErr } = await supabaseAdmin
            .from('posts').select('status, image_settings').eq('id', postId).single();
        if (readErr) return NextResponse.json({ success: false, error: readErr.message }, { status: 404 });

        // Stamp studio activity so the post surfaces in the Studio workbench
        // (drafts + recently-edited), and promote a pending post to draft —
        // once you're editing it in Studio it's your working draft.
        const image_settings = { ...(existing?.image_settings || {}), video_project: project, studio_edited_at: new Date().toISOString() };
        const update: Record<string, any> = { image_settings };
        if (existing?.status === 'pending') update.status = 'draft';
        const { error } = await supabaseAdmin.from('posts').update(update).eq('id', postId);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('[studio/save-project] error', e);
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
