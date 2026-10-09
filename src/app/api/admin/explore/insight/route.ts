/**
 * POST /api/admin/explore/insight  { id, action: 'dismiss' | 'act' }
 *
 * Dismissed cards stop rendering and are fed back to the next run so the model
 * does not re-suggest them. 'act' marks a card the owner acted on (e.g. started a
 * carousel from it); it stays visible and counts toward "Acted on" in AI Insights.
 * Owner or `analytics` permission.
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
    const action = body?.action;
    if (!UUID.test(id) || (action !== 'dismiss' && action !== 'act')) {
        return NextResponse.json({ ok: false, error: 'Expected { id, action: "dismiss" | "act" }' }, { status: 400 });
    }
    const { error } = await supabaseAdmin.from('explore_insights')
        .update({ state: action === 'act' ? 'acted' : 'dismissed', state_by: access.email, state_at: new Date().toISOString() })
        .eq('id', id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
