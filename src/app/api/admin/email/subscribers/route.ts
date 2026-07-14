/**
 * /api/admin/email/subscribers  (owner-only)
 *
 * The middleware gates /api/admin/email/* to the owner; this handler checks
 * again as defense-in-depth (same pattern as /api/admin/team/users).
 *
 *   GET    → list (capped at 500, newest first) + counts { total, subscribed }
 *   POST   { email, name? } → upsert one subscriber (source 'manual')
 *   DELETE { id or email }  → soft-unsubscribe (status + unsubscribed_at)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAccess } from '@/lib/auth/access';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireOwnerOr403() {
    const access = await getAccess();
    if (!access.isOwner) {
        return NextResponse.json({ success: false, error: 'Only the owner can manage the email list.' }, { status: 403 });
    }
    return null;
}

function cleanEmail(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const email = raw.trim().toLowerCase();
    return EMAIL_RE.test(email) ? email : null;
}

export async function GET() {
    const denied = await requireOwnerOr403();
    if (denied) return denied;

    try {
        const [{ data: rows, error }, { count: total }, { count: subscribed }] = await Promise.all([
            supabaseAdmin
                .from('email_subscribers')
                .select('id, email, name, status, source, created_at')
                .order('created_at', { ascending: false })
                .limit(500),
            supabaseAdmin.from('email_subscribers').select('id', { count: 'exact', head: true }),
            supabaseAdmin.from('email_subscribers').select('id', { count: 'exact', head: true }).eq('status', 'subscribed'),
        ]);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        return NextResponse.json({
            success: true,
            subscribers: rows ?? [],
            counts: { total: total ?? 0, subscribed: subscribed ?? 0 },
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Could not load subscribers' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const denied = await requireOwnerOr403();
    if (denied) return denied;

    try {
        const body = await req.json().catch(() => ({}));
        const email = cleanEmail(body?.email);
        const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) || null : null;
        if (!email) return NextResponse.json({ success: false, error: 'A valid email is required' }, { status: 400 });

        const { error } = await supabaseAdmin
            .from('email_subscribers')
            .upsert(
                { email, name, status: 'subscribed', source: 'manual', unsubscribed_at: null },
                { onConflict: 'email' },
            );
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Could not add subscriber' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const denied = await requireOwnerOr403();
    if (denied) return denied;

    try {
        const body = await req.json().catch(() => ({}));
        const id = typeof body?.id === 'string' ? body.id : null;
        const email = cleanEmail(body?.email);
        if (!id && !email) return NextResponse.json({ success: false, error: 'An id or email is required' }, { status: 400 });

        let query = supabaseAdmin
            .from('email_subscribers')
            .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() });
        query = id ? query.eq('id', id) : query.eq('email', email!);
        const { error } = await query;
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Could not remove subscriber' }, { status: 500 });
    }
}
