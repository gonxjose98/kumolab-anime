/**
 * /api/admin/team/users  (owner-only)
 *
 * Manage KumoLab team logins + their per-user permissions. The middleware
 * gates /api/admin/* to authenticated users; this handler additionally
 * requires the OWNER (by email) — no sub-user can create accounts or change
 * permissions, ever (Jose's directive).
 *
 *   POST   { email, password, permissions } → create auth user + admin_users row
 *   PUT    { email, permissions }           → update a member's permissions
 *   DELETE { email }                        → delete auth user + admin_users row
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAccess, normalizePerms, OWNER_EMAIL } from '@/lib/auth/access';
import { logAction } from '@/lib/logging/structured-logger';

export const dynamic = 'force-dynamic';

async function requireOwnerOr403() {
    const access = await getAccess();
    if (!access.isOwner) {
        return NextResponse.json({ success: false, error: 'Only the owner can manage the team.' }, { status: 403 });
    }
    return null;
}

function cleanEmail(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const email = raw.trim().toLowerCase();
    if (!email || !email.includes('@')) return null;
    return email;
}

/** A member's display name, trimmed and capped; empty → null (no name). */
function cleanName(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    const name = raw.trim().slice(0, 60);
    return name.length ? name : null;
}

export async function POST(req: NextRequest) {
    const denied = await requireOwnerOr403();
    if (denied) return denied;

    try {
        const body = await req.json().catch(() => ({}));
        const email = cleanEmail(body?.email);
        const password = typeof body?.password === 'string' ? body.password : '';
        const permissions = normalizePerms(body?.permissions);
        const displayName = cleanName(body?.name);
        const welcomePending = body?.welcome === true;

        if (!email) return NextResponse.json({ success: false, error: 'A valid email is required' }, { status: 400 });
        if (password.length < 8) return NextResponse.json({ success: false, error: 'Password must be at least 8 characters' }, { status: 400 });
        if (email === OWNER_EMAIL) return NextResponse.json({ success: false, error: 'That email is the owner account.' }, { status: 400 });

        // Create the Supabase auth user (no confirmation email — the owner sets the password).
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
        });
        if (createErr || !created?.user) {
            return NextResponse.json({ success: false, error: createErr?.message || 'Could not create the login' }, { status: 400 });
        }

        const { error: insertErr } = await supabaseAdmin.from('admin_users').insert({
            user_id: created.user.id,
            email,
            permissions,
            display_name: displayName,
            welcome_pending: welcomePending,
            created_by: OWNER_EMAIL,
        });
        if (insertErr) {
            // Roll back the orphaned auth user so a retry can reuse the email.
            await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {});
            return NextResponse.json({ success: false, error: insertErr.message }, { status: 400 });
        }

        await logAction({ action: 'team_member_added', entityType: 'admin_user', entityId: email, actor: 'Owner', reason: `Added ${email}` }).catch(() => {});
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Could not add member' }, { status: 500 });
    }
}

export async function PUT(req: NextRequest) {
    const denied = await requireOwnerOr403();
    if (denied) return denied;

    try {
        const body = await req.json().catch(() => ({}));
        const email = cleanEmail(body?.email);
        const permissions = normalizePerms(body?.permissions);
        const displayName = cleanName(body?.name);
        const welcomePending = body?.welcome === true;
        if (!email) return NextResponse.json({ success: false, error: 'A valid email is required' }, { status: 400 });
        if (email === OWNER_EMAIL) return NextResponse.json({ success: false, error: 'The owner cannot be edited.' }, { status: 400 });

        const { error } = await supabaseAdmin
            .from('admin_users')
            .update({ permissions, display_name: displayName, welcome_pending: welcomePending })
            .eq('email', email);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

        await logAction({ action: 'team_member_updated', entityType: 'admin_user', entityId: email, actor: 'Owner', reason: `Updated permissions for ${email}` }).catch(() => {});
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Could not update member' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const denied = await requireOwnerOr403();
    if (denied) return denied;

    try {
        const body = await req.json().catch(() => ({}));
        const email = cleanEmail(body?.email);
        if (!email) return NextResponse.json({ success: false, error: 'A valid email is required' }, { status: 400 });
        if (email === OWNER_EMAIL) return NextResponse.json({ success: false, error: 'The owner cannot be removed.' }, { status: 400 });

        const { data: row } = await supabaseAdmin.from('admin_users').select('user_id').eq('email', email).maybeSingle();
        if (row?.user_id) {
            await supabaseAdmin.auth.admin.deleteUser(row.user_id as string).catch(() => {});
        }
        const { error } = await supabaseAdmin.from('admin_users').delete().eq('email', email);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

        await logAction({ action: 'team_member_removed', entityType: 'admin_user', entityId: email, actor: 'Owner', reason: `Removed ${email}` }).catch(() => {});
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Could not remove member' }, { status: 500 });
    }
}
