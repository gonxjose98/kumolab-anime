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
        // Accepts either a single `url` (legacy, single photo) or a `urls`
        // array (multi-file upload → one draft whose image_settings.slides
        // holds one slide per picture — an instant carousel).
        const rawUrls: unknown[] = Array.isArray(body?.urls)
            ? body.urls
            : (typeof body?.url === 'string' ? [body.url] : []);
        const urls = rawUrls
            .map(u => (typeof u === 'string' ? u.trim() : ''))
            .filter(Boolean);
        if (!urls.length) return NextResponse.json({ success: false, error: 'url is required' }, { status: 400 });

        const now = new Date().toISOString();
        const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : 'Untitled photo';

        // sourceUrl (slide 1's photo) is what the post editor hydrates as its
        // render source; studio_edited_at keeps the draft visible in the
        // Images hub. 2+ photos additionally get a slides array (each with
        // empty default settings — the editor fills in the all-OFF defaults);
        // a single photo keeps the exact legacy shape.
        const image_settings: Record<string, any> = { sourceUrl: urls[0], studio_edited_at: now };
        if (urls.length >= 2) {
            image_settings.slides = urls.map(u => ({ sourceUrl: u, title: '', excerpt: '', settings: {} }));
        }

        const draft = {
            slug: `photo-${randomUUID().slice(0, 8)}`, // unique
            title,
            content: '',
            excerpt: '',
            image: urls[0],
            type: 'COMMUNITY',
            source: 'KumoLab Studio',
            source_tier: 1,
            status: 'draft',
            is_published: false,
            timestamp: now,
            image_settings,
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
