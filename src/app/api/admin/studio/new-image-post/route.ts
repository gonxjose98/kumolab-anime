/**
 * /api/admin/studio/new-image-post
 *
 * Thin "start from a fresh photo" entry for the Studio Images hub: the hub
 * uploads a picture via /api/admin/upload-image, then calls this with the
 * returned URL. We insert a clean draft post carrying that image and hand
 * back the id so the client can open /admin/post/[id] immediately.
 *
 * The uploaded URL is stored BOTH as post.image (thumbnail + fallback render
 * source) and image_settings.sourceUrl (what the editor hydrates as the
 * render source), so the editor opens straight onto the fresh photo.
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
        const url = typeof body?.url === 'string' ? body.url.trim() : '';
        if (!url) return NextResponse.json({ success: false, error: 'url is required' }, { status: 400 });

        const now = new Date().toISOString();
        const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : 'Untitled photo';

        const draft = {
            slug: `photo-${randomUUID().slice(0, 8)}`, // unique
            title,
            content: '',
            excerpt: '',
            image: url,
            type: 'COMMUNITY',
            source: 'KumoLab Studio',
            source_tier: 1,
            status: 'draft',
            is_published: false,
            timestamp: now,
            // sourceUrl is what the post editor hydrates as its render source;
            // studio_edited_at keeps the draft visible in the Images hub.
            image_settings: { sourceUrl: url, studio_edited_at: now },
        };

        const { data: inserted, error: insErr } = await supabaseAdmin
            .from('posts').insert([draft]).select('id').single();
        if (insErr || !inserted) {
            return NextResponse.json({ success: false, error: insErr?.message || 'Draft create failed' }, { status: 500 });
        }

        return NextResponse.json({ success: true, id: inserted.id });
    } catch (e: any) {
        console.error('[studio/new-image-post] error', e);
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
