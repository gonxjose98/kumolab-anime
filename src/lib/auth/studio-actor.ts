/**
 * Studio actor resolution — WHO is editing, for internal attribution.
 *
 * The Studio admin routes run on supabaseAdmin (service role), so the DB
 * write itself carries no caller identity. This helper reads the Supabase
 * session cookie (same pattern as /api/admin/studio/templates) and resolves
 * a short display name:
 *   owner email            → "Jose"
 *   admin_users row        → display_name (e.g. "Jonathan")
 *   anything else          → the email's local part ("jon011901")
 *
 * Best-effort bookkeeping: auth is already enforced by the middleware, so a
 * missing/broken session returns null and callers simply skip attribution
 * (e.g. server/cron invocations that carry no cookie).
 */

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { OWNER_EMAIL } from '@/lib/auth/access';

export interface StudioActor {
    email: string;
    /** Short internal label: "Jose", "Jonathan", or the email's local part. */
    name: string;
}

export async function getStudioActor(): Promise<StudioActor | null> {
    let email: string | null = null;
    try {
        const cookieStore = await cookies();
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } },
        );
        const { data } = await supabase.auth.getUser();
        email = data?.user?.email?.toLowerCase() ?? null;
    } catch {
        return null;
    }
    if (!email) return null;
    if (email === OWNER_EMAIL) return { email, name: 'Jose' };

    try {
        const { data: row } = await supabaseAdmin
            .from('admin_users').select('display_name').eq('email', email).maybeSingle();
        const display = typeof row?.display_name === 'string' ? row.display_name.trim() : '';
        if (display) return { email, name: display };
    } catch {
        // fall through to the local-part fallback
    }
    return { email, name: email.split('@')[0] };
}

/**
 * Append one row to the studio_activity production log. Fire on "produced"
 * actions ONLY (video finalize, photo Save persist) — never on autosaves,
 * so the per-user counts reflect real output. Failures are logged and
 * swallowed: attribution must never break a save/export.
 */
export async function recordStudioActivity(
    actor: StudioActor,
    postId: string,
    kind: 'video' | 'photo',
    action: 'finalize' | 'save',
): Promise<void> {
    try {
        const { error } = await supabaseAdmin.from('studio_activity').insert({
            user_email: actor.email,
            user_name: actor.name,
            post_id: postId,
            kind,
            action,
        });
        if (error) console.error('[studio-actor] activity insert failed:', error.message);
    } catch (e: any) {
        console.error('[studio-actor] activity insert failed:', e?.message || e);
    }
}
