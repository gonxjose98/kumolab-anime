import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Per-user admin permissions (KumoLab team members).
 *
 * The OWNER (by email) implicitly has every permission plus exclusive Team
 * management, and can never be locked out through the UI. Everyone else's
 * access is stored as a jsonb of booleans in `admin_users`. A brand-new member
 * is created with all toggles ON (a clone of the owner's operational view);
 * the owner unchecks what they shouldn't have.
 */

export const OWNER_EMAIL = (process.env.OWNER_EMAIL ?? 'gonxjose98@gmail.com').toLowerCase();

export const PERMISSIONS = ['pending', 'studio', 'content', 'analytics', 'store'] as const;
export type Perm = (typeof PERMISSIONS)[number];
export type Perms = Record<Perm, boolean>;

export const PERM_LABELS: Record<Perm, string> = {
    pending: 'Pending review',
    studio: 'Studio (edit + upload)',
    content: 'Content',
    analytics: 'Analytics',
    store: 'Store',
};

const NONE: Perms = { pending: false, studio: false, content: false, analytics: false, store: false };
const ALL: Perms = { pending: true, studio: true, content: true, analytics: true, store: true };

export const allPerms = (): Perms => ({ ...ALL });
export const normalizePerms = (raw: unknown): Perms => {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const out = { ...NONE };
    for (const p of PERMISSIONS) out[p] = r[p] === true;
    return out;
};

export interface Access {
    email: string | null;
    isOwner: boolean;
    perms: Perms;
}

/**
 * Server-only. Resolve the current admin user's email + permission set from
 * the session (getUser verifies the JWT, not just the cookie). Owner → all.
 */
export async function getAccess(): Promise<Access> {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } },
    );
    const { data } = await supabase.auth.getUser();
    const email = data?.user?.email?.toLowerCase() ?? null;
    if (!email) return { email: null, isOwner: false, perms: { ...NONE } };
    if (email === OWNER_EMAIL) return { email, isOwner: true, perms: { ...ALL } };

    try {
        const { data: row } = await supabaseAdmin
            .from('admin_users').select('permissions').eq('email', email).maybeSingle();
        return { email, isOwner: false, perms: normalizePerms(row?.permissions) };
    } catch {
        return { email, isOwner: false, perms: { ...NONE } };
    }
}

/** Section-layout guard: signed in AND holds `perm` (owner bypasses). */
export async function requireAccess(perm: Perm): Promise<Access> {
    const access = await getAccess();
    if (!access.email) redirect('/admin/login');
    if (!access.isOwner && !access.perms[perm]) redirect('/admin/dashboard');
    return access;
}

/** Signed in with ANY of `perms` (the shared post editor is reachable from several tabs). */
export async function requireAnyAccess(perms: Perm[]): Promise<Access> {
    const access = await getAccess();
    if (!access.email) redirect('/admin/login');
    if (!access.isOwner && !perms.some((p) => access.perms[p])) redirect('/admin/dashboard');
    return access;
}

/** Just signed in (e.g. the Dashboard, available to everyone). */
export async function requireSignedIn(): Promise<Access> {
    const access = await getAccess();
    if (!access.email) redirect('/admin/login');
    return access;
}

/** Owner only (Team manager). */
export async function requireOwner(): Promise<Access> {
    const access = await getAccess();
    if (!access.email) redirect('/admin/login');
    if (!access.isOwner) redirect('/admin/dashboard');
    return access;
}
