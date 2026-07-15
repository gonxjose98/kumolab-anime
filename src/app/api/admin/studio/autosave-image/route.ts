/**
 * /api/admin/studio/autosave-image
 *
 * Lightweight autosave for the image/photo editor (Jose, 2026-07-10 — "auto
 * save after every edit"). Persists the edit description (overlay settings +
 * title/caption/hashtags) so nothing is lost, stamps studio activity, and
 * promotes a pending post to draft. It does NOT re-render/re-bake the image —
 * that still happens on the explicit Save (which produces the published bytes).
 *
 * Never downgrades an approved/published post to draft: live content is edited
 * via a draft copy (see studio/duplicate), so autosave only promotes pending.
 *
 * Uses supabaseAdmin (service role); /api/posts PUT excludes image_settings.
 * Auth enforced by middleware on /api/admin/*.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { SETTING_KEYS, applySlides } from '@/lib/studio/slides';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const postId = body?.postId != null ? String(body.postId) : '';
        if (!postId) return NextResponse.json({ success: false, error: 'postId is required' }, { status: 400 });

        const { data: existing, error: readErr } = await supabaseAdmin
            .from('posts').select('status, image_settings').eq('id', postId).single();
        if (readErr) return NextResponse.json({ success: false, error: readErr.message }, { status: 404 });

        // Merge only the known setting keys (preserves video_project + anything else).
        const image_settings: Record<string, any> = { ...((existing?.image_settings as any) || {}) };
        const s = body?.settings || {};
        for (const k of SETTING_KEYS) if (k in s) image_settings[k] = s[k];
        if (typeof body?.sourceUrl === 'string') image_settings.sourceUrl = body.sourceUrl;
        // Carousel slides: an explicit array with 2+ entries persists as
        // image_settings.slides; 0-1 entries collapse back to the legacy
        // single-image shape (key removed); no field at all = untouched.
        applySlides(image_settings, body?.slides);
        image_settings.studio_edited_at = new Date().toISOString();

        const update: Record<string, any> = { image_settings };
        if (typeof body?.title === 'string') update.title = body.title;
        if (typeof body?.excerpt === 'string') update.excerpt = body.excerpt;
        if (typeof body?.content === 'string') update.content = body.content;
        if (Array.isArray(body?.hashtags)) update.hashtags = body.hashtags;
        // Editing something makes it your draft — but only promote from pending,
        // never demote a live (approved/published) post.
        const status = existing?.status === 'pending' ? 'draft' : existing?.status;
        if (status !== existing?.status) update.status = status;

        const { error } = await supabaseAdmin.from('posts').update(update).eq('id', postId);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

        return NextResponse.json({ success: true, status });
    } catch (e: any) {
        console.error('[studio/autosave-image] error', e);
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
