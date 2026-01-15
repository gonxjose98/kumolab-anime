import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
    const res = NextResponse.next();
    const supabase = createMiddlewareClient({ req, res });

    const {
        data: { session },
    } = await supabase.auth.getSession();

    const url = req.nextUrl;

    // 1. ADMIN ROUTE PROTECTION
    if (url.pathname.startsWith('/admin')) {

        // EXCEPTION: Login page is public (if not already logged in)
        if (url.pathname === '/admin/login') {
            if (session) {
                // Already logged in? Go to dashboard
                return NextResponse.redirect(new URL('/admin/dashboard', req.url));
            }
            return res; // Allow access to login page
        }

        // LISTENER: All other /admin routes require session
        if (!session) {
            // "Unauthenticated access should redirect to /404"
            // We rewrite the URL to the 404 page internally, hiding the existence of the route
            return NextResponse.rewrite(new URL('/404', req.url));
        }
    }

    return res;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
