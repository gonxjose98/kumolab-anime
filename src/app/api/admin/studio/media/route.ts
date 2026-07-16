/**
 * /api/admin/studio/media — assets inside a media-library folder.
 *
 * The FILE is uploaded separately by the browser via /api/admin/upload-sign
 * (signed PUT straight to Supabase Storage — handles large videos, bypasses
 * the request-body limit); this route only registers/lists/removes the
 * bookkeeping row. Assets are raw material, NOT posts: nothing here touches
 * the publish pipeline.
 *
 *   GET ?folderId=<uuid> → { success, media: [{ id, url, kind, filename,
 *                             uploaded_by, created_at }] }  (newest-first)
 *   POST { folderId, url, kind, filename?, mime? }
 *                        → { success, media }  (uploaded_by from getStudioActor)
 *   DELETE ?id=<uuid>    → { success }  (row only; the storage file remains)
 *
 * Storage: studio_media (RLS enabled, no policies — service-role only).
 * Auth: middleware gates /api/admin/studio/* by Supabase session + the
 * 'studio' permission for sub-users.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getStudioActor } from '@/lib/auth/studio-actor';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const folderId = req.nextUrl.searchParams.get('folderId') || '';
        if (!folderId) {
            return NextResponse.json({ success: false, error: 'folderId is required' }, { status: 400 });
        }
        const { data, error } = await supabaseAdmin
            .from('studio_media')
            .select('id, url, kind, filename, uploaded_by, created_at')
            .eq('folder_id', folderId)
            .order('created_at', { ascending: false });
        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, media: data ?? [] });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const folderId = typeof body?.folderId === 'string' ? body.folderId : '';
        const url = typeof body?.url === 'string' ? body.url.trim() : '';
        const kind = body?.kind === 'video' ? 'video' : body?.kind === 'image' ? 'image' : '';
        if (!folderId) {
            return NextResponse.json({ success: false, error: 'folderId is required' }, { status: 400 });
        }
        if (!url) {
            return NextResponse.json({ success: false, error: 'url is required' }, { status: 400 });
        }
        if (!kind) {
            return NextResponse.json({ success: false, error: 'kind must be "image" or "video"' }, { status: 400 });
        }

        const actor = await getStudioActor();
        const { data, error } = await supabaseAdmin
            .from('studio_media')
            .insert({
                folder_id: folderId,
                url,
                kind,
                filename: typeof body?.filename === 'string' ? body.filename.slice(0, 200) : null,
                mime: typeof body?.mime === 'string' ? body.mime.slice(0, 100) : null,
                uploaded_by: actor?.name ?? null,
                uploaded_by_email: actor?.email ?? null,
            })
            .select('id, url, kind, filename, uploaded_by, created_at')
            .single();
        if (error) {
            return NextResponse.json({ success: false, error: `DB save failed: ${error.message}` }, { status: 500 });
        }
        return NextResponse.json({ success: true, media: data });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const id = req.nextUrl.searchParams.get('id') || '';
        if (!id) {
            return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
        }
        const { error } = await supabaseAdmin.from('studio_media').delete().eq('id', id);
        if (error) {
            return NextResponse.json({ success: false, error: `Delete failed: ${error.message}` }, { status: 500 });
        }
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
