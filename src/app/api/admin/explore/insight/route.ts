/**
 * POST /api/admin/explore/insight  { id, action: 'dismiss' }
 *
 * Dismissed cards stop rendering and are fed back to the next run so the model
 * does not re-suggest them. Owner or `analytics` permission.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAccess } from '@/lib/auth/access';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(req: NextRequest) {
    const access = await getAccess();
    if (!access.email || (!access.isOwner && !access.perms.analytics)) {
        return NextResponse.json({ ok: false, error: 'Not allowed' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const id = typeof body?.id === 'string' ? body.id : '';
    if (!UUID.test(id) || body?.action !== 'dismiss') {
        return NextResponse.json({ ok: false, error: 'Expected { id, action: "dismiss" }' }, { status: 400 });
    }
    const { error } = await supabaseAdmin.from('explore_insights')
        .update({ state: 'dismissed', state_by: access.email, state_at: new Date().toISOString() })
        .eq('id', id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
