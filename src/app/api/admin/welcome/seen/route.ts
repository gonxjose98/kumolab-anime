/**
 * /api/admin/welcome/seen  (POST)
 *
 * Consumes the one-time welcome animation for the CURRENT signed-in member:
 * clears their `welcome_pending` flag so the cinematic plays exactly once and
 * the owner's Team toggle auto-flips back off. A user can only clear their own
 * flag (keyed off the verified session email), so this is safe to leave open
 * to any signed-in user. Middleware gates /api/admin/*.
 */

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAccess } from '@/lib/auth/access';

export const dynamic = 'force-dynamic';

export async function POST() {
    try {
        const access = await getAccess();
        if (!access.email) {
            return NextResponse.json({ success: false, error: 'Not signed in' }, { status: 401 });
        }
        // Owner has no admin_users row and never has a pending flag — no-op.
        if (!access.isOwner) {
            await supabaseAdmin
                .from('admin_users')
                .update({ welcome_pending: false })
                .eq('email', access.email);
        }
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Failed' }, { status: 500 });
    }
}
