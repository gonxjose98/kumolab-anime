/**
 * /api/admin/studio/templates — named layout templates for the photo editor.
 *
 * A template is the LAYOUT/STYLE subset of a slide's overlay settings
 * (LAYOUT_TEMPLATE_KEYS: text/gradient/watermark toggles + placement,
 * scales, image zoom/pan). It never contains the slide's title/excerpt
 * text, its source image, or purpleWordIndices — applying a template
 * copies the look onto any other slide/picture, not the content.
 *
 *   GET              → { success, templates: [{ id, name, settings, created_at }] }
 *   POST { name, settings } → { success, template }   (settings re-picked server-side)
 *   DELETE ?id=<uuid> → { success }
 *
 * Storage: studio_templates (RLS enabled, no policies — service-role only,
 * so templates persist across sessions, browsers, and posts).
 * Auth: middleware gates /api/admin/studio/* by Supabase session + the
 * 'studio' permission for sub-users.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { pickLayoutSettings } from '@/lib/studio/slides';

export const dynamic = 'force-dynamic';

// Best-effort caller identity for created_by. Auth itself is already
// enforced by the middleware; this is bookkeeping, so failures return null.
async function callerEmail(): Promise<string | null> {
    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } },
        );
        const { data } = await supabase.auth.getUser();
        return data?.user?.email ?? null;
    } catch {
        return null;
    }
}

export async function GET() {
    try {
        const { data, error } = await supabaseAdmin
            .from('studio_templates')
            .select('id, name, settings, created_at')
            .eq('kind', 'photo')
            .order('created_at', { ascending: false });
        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        return NextResponse.json({ success: true, templates: data ?? [] });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 60) : '';
        if (!name) {
            return NextResponse.json({ success: false, error: 'Template name is required.' }, { status: 400 });
        }
        // Server-side pick: whatever the client sent, only the layout keys
        // persist — text content, sourceUrl, and purpleWordIndices can never
        // leak into a template.
        const settings = pickLayoutSettings(body?.settings);
        if (Object.keys(settings).length === 0) {
            return NextResponse.json({ success: false, error: 'Template settings are missing.' }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from('studio_templates')
            .insert({ name, kind: 'photo', settings, created_by: await callerEmail() })
            .select('id, name, settings, created_at')
            .single();
        if (error) {
            return NextResponse.json({ success: false, error: `DB save failed: ${error.message}` }, { status: 500 });
        }
        return NextResponse.json({ success: true, template: data });
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
        const { error } = await supabaseAdmin.from('studio_templates').delete().eq('id', id);
        if (error) {
            return NextResponse.json({ success: false, error: `Delete failed: ${error.message}` }, { status: 500 });
        }
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
