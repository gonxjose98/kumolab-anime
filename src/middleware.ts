import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Auth middleware for KumoLab API surface.
 *
 *   /api/cron/*   — Vercel cron header OR Bearer ${CRON_SECRET}
 *   /api/admin/*  — Valid Supabase session (cookie), validated via getUser()
 *
 * getUser() is used (not getSession) because it round-trips to the Supabase
 * server to verify the JWT, instead of trusting the cookie at face value.
 *
 * Page routes under /admin/* are gated separately by their own layout.tsx
 * server components — this middleware only protects the JSON API surface.
 */

// Routes inside /api/admin that must remain reachable without a session
// (none today; reserved for any future "set-cookie" exchange route).
//
// DO NOT add the agent routes below to this set. It is an UNCONDITIONAL auth
// bypass — membership here means no credential of any kind is checked. The
// agent surface needs a key, so it gets its own branch instead.
const ADMIN_PUBLIC_API: ReadonlySet<string> = new Set();

// ── AI-agent API surface ────────────────────────────────────────
//
// These paths accept `Authorization: Bearer ${AGENT_API_KEY}` in ADDITION to a
// normal admin cookie session, so an external agent Jose connects can read the
// system state and report what it is working on.
//
// They live under /api/admin deliberately: the middleware matcher only covers
// /api/cron, /api/admin and /api/posts, so a route at /api/agent/* would match
// NOTHING and ship as a completely unauthenticated public endpoint — including
// the heartbeat, which writes.
//
// The key is compared with a length-independent scan rather than === to avoid
// leaking its length through response timing.
const AGENT_BEARER_API: readonly string[] = [
    '/api/admin/engine/state',
    '/api/admin/agent/heartbeat',
];

function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

/** True when this request carries a valid agent key for an agent-enabled path. */
function hasAgentKey(req: NextRequest): boolean {
    if (!AGENT_BEARER_API.some((p) => req.nextUrl.pathname === p)) return false;
    const key = process.env.AGENT_API_KEY;
    // Unset key = feature off. Never fall open.
    if (!key || key.length < 16) return false;
    const header = req.headers.get('authorization') ?? '';
    if (!header.startsWith('Bearer ')) return false;
    return safeEqual(header.slice(7), key);
}

// Per-permission gate for the JSON admin APIs. Being logged in is not enough:
// a sub-user whose toggle is OFF for an area must not be able to call that
// area's API directly (e.g. confirming a Printful order = spending money).
// The owner (by email) bypasses everything. Mirrors the page-layout gates.
const OWNER_EMAIL = (process.env.OWNER_EMAIL ?? 'gonxjose98@gmail.com').toLowerCase();
const OWNER_ONLY_PREFIXES = ['/api/admin/team', '/api/admin/email'];
const ROUTE_PERMS: { prefix: string; perm: string }[] = [
    { prefix: '/api/admin/analytics', perm: 'analytics' },
    { prefix: '/api/admin/orders', perm: 'store' },
    { prefix: '/api/admin/merch-settings', perm: 'store' },
    { prefix: '/api/admin/store', perm: 'store' },
    { prefix: '/api/admin/studio', perm: 'studio' },
    { prefix: '/api/admin/approve', perm: 'pending' },
    { prefix: '/api/admin/decline', perm: 'pending' },
    { prefix: '/api/admin/bulk-delete', perm: 'content' },
    { prefix: '/api/admin/custom-post', perm: 'content' },
    { prefix: '/api/admin/import-from-url', perm: 'content' },
    { prefix: '/api/admin/engine', perm: 'content' },
];

function unauthorized(message: string) {
    return NextResponse.json({ error: 'Unauthorized', detail: message }, { status: 401 });
}

function forbidden(message: string) {
    return NextResponse.json({ error: 'Forbidden', detail: message }, { status: 403 });
}

/** Read a sub-user's permission booleans via the service role (RLS bypass);
 *  runs only for non-owner callers on permission-gated routes. */
async function fetchPerms(email: string): Promise<Record<string, boolean>> {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !svc) return {};
    try {
        const r = await fetch(
            `${url}/rest/v1/admin_users?email=eq.${encodeURIComponent(email)}&select=permissions`,
            { headers: { apikey: svc, Authorization: `Bearer ${svc}` }, cache: 'no-store' },
        );
        if (!r.ok) return {};
        const rows = (await r.json()) as { permissions?: Record<string, boolean> }[];
        return rows?.[0]?.permissions ?? {};
    } catch {
        return {};
    }
}

function checkCron(req: NextRequest): NextResponse | null {
    const isVercelCron = req.headers.get('x-vercel-cron') === '1';
    if (isVercelCron) return null;

    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return null;

    return unauthorized('cron requires Vercel cron header or CRON_SECRET bearer');
}

async function checkAdmin(req: NextRequest): Promise<NextResponse | null> {
    if (ADMIN_PUBLIC_API.has(req.nextUrl.pathname)) return null;

    // A valid agent key stands in for a session on the agent surface only.
    // Checked before the Supabase round-trip because an agent has no cookie and
    // would otherwise be rejected at getUser().
    if (hasAgentKey(req)) return null;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
        return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    const res = NextResponse.next();
    const supabase = createServerClient(url, anon, {
        cookies: {
            get(name) {
                return req.cookies.get(name)?.value;
            },
            set(name, value, opts) {
                res.cookies.set({ name, value, ...opts });
            },
            remove(name, opts) {
                res.cookies.set({ name, value: '', ...opts });
            },
        },
    });

    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return unauthorized('admin requires authenticated session');

    // Per-permission enforcement (defense in depth beyond the page layouts).
    const email = data.user.email?.toLowerCase() ?? '';
    if (email === OWNER_EMAIL) return res; // owner: full access

    const path = req.nextUrl.pathname;
    if (OWNER_ONLY_PREFIXES.some((p) => path.startsWith(p))) {
        return forbidden('owner only');
    }
    const need = ROUTE_PERMS.find((r) => path.startsWith(r.prefix));
    if (need) {
        const perms = await fetchPerms(email);
        if (perms[need.perm] !== true) return forbidden(`requires ${need.perm} permission`);
    }

    return res;
}

// Methods that mutate state must always go through admin auth, regardless of path.
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    if (pathname.startsWith('/api/cron')) {
        return checkCron(req) ?? NextResponse.next();
    }

    if (pathname.startsWith('/api/admin')) {
        return (await checkAdmin(req)) ?? NextResponse.next();
    }

    // /api/posts: GET is public (the route handler enforces published-only for
    // unauthenticated callers); any state-changing method requires admin auth.
    if (pathname === '/api/posts' || pathname.startsWith('/api/posts/')) {
        if (MUTATING_METHODS.has(req.method)) {
            return (await checkAdmin(req)) ?? NextResponse.next();
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/api/cron/:path*', '/api/admin/:path*', '/api/posts/:path*', '/api/posts'],
};
