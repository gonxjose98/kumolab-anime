/**
 * /api/admin/studio/folders — media-library folders (raw assets, NOT posts).
 *
 *   GET               → { success, folders: [{ id, name, created_by, created_at,
 *                          count, cover }], actor }
 *                        count = number of assets, cover = first image url (or null),
 *                        actor = the caller's Studio display name (for the UI label).
 *   POST { name }     → { success, folder }   (created_by from getStudioActor)
 *   DELETE ?id=<uuid> → { success }           (studio_media rows cascade with the
 *                        folder; storage files intentionally remain — see migration)
 *
 * Storage: studio_folders / studio_media (RLS enabled, no policies —
 * service-role only, same convention as studio_templates).
 * Auth: middleware gates /api/admin/studio/* by Supabase session + the
 * 'studio' permission for sub-users.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getStudioActor } from '@/lib/auth/studio-actor';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const [{ data: folders, error }, { data: media, error: mediaErr }, actor] = await Promise.all([
            supabaseAdmin
                .from('studio_folders')
                .select('id, name, created_by, created_at')
                .order('created_at', { ascending: false }),
            // Newest-first so per-folder "first image" = the latest upload.
            supabaseAdmin
                .from('studio_media')
                .select('folder_id, url, kind')
                .order('created_at', { ascending: false })
                .limit(5000),
            getStudioActor(),
        ]);
        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        if (mediaErr) {
            return NextResponse.json({ success: false, error: mediaErr.message }, { status: 500 });
        }

        const counts = new Map<string, number>();
        const covers = new Map<string, string>();
        for (const m of media ?? []) {
            if (!m.folder_id) continue;
            counts.set(m.folder_id, (counts.get(m.folder_id) || 0) + 1);
            if (m.kind === 'image' && m.url && !covers.has(m.folder_id)) {
                covers.set(m.folder_id, m.url);
            }
        }

        return NextResponse.json({
            success: true,
            folders: (folders ?? []).map((f) => ({
                ...f,
                count: counts.get(f.id) || 0,
                cover: covers.get(f.id) || null,
            })),
            actor: actor?.name ?? null,
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
        if (!name) {
            return NextResponse.json({ success: false, error: 'Folder name is required.' }, { status: 400 });
        }

        const actor = await getStudioActor();
        const { data, error } = await supabaseAdmin
            .from('studio_folders')
            .insert({ name, created_by: actor?.name ?? null, created_by_email: actor?.email ?? null })
            .select('id, name, created_by, created_at')
            .single();
        if (error) {
            return NextResponse.json({ success: false, error: `DB save failed: ${error.message}` }, { status: 500 });
        }
        return NextResponse.json({ success: true, folder: { ...data, count: 0, cover: null } });
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
        // studio_media rows cascade with the folder (FK on delete cascade).
        // Storage files are intentionally NOT removed — see the migration note.
        const { error } = await supabaseAdmin.from('studio_folders').delete().eq('id', id);
        if (error) {
            return NextResponse.json({ success: false, error: `Delete failed: ${error.message}` }, { status: 500 });
        }
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
