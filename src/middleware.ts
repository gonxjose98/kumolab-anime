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
const ADMIN_PUBLIC_API: ReadonlySet<string> = new Set();

function unauthorized(message: string) {
    return NextResponse.json({ error: 'Unauthorized', detail: message }, { status: 401 });
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

    return res;
}

export async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    if (pathname.startsWith('/api/cron')) {
        return checkCron(req) ?? NextResponse.next();
    }

    if (pathname.startsWith('/api/admin')) {
        return (await checkAdmin(req)) ?? NextResponse.next();
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/api/cron/:path*', '/api/admin/:path*'],
};
