import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logError } from '@/lib/logging/structured-logger';

export const dynamic = 'force-dynamic';

/**
 * Public, unauthenticated page-view recorder.
 *
 * WHY THIS EXISTS: the browser used to insert into `page_views` directly with
 * the anon key. Every table in this DB has RLS enabled with NO table policies
 * (service-role-only by design), so those anon inserts were silently denied and
 * `page_views` never recorded a single row — website traffic was invisible.
 *
 * The write now goes through the service-role client (which bypasses RLS), so
 * no RLS policy / migration is needed. Keeping it server-side also lets us
 * derive `is_bot` from the real User-Agent header instead of trusting the
 * client, and gives us one place to validate/rate-limit later.
 *
 * This path is intentionally NOT in middleware's matcher, so it stays public.
 */

const BOT_RE =
    /bot|crawl|spider|slurp|google|baidu|bing|msn|teoma|yandex|duckduck|facebookexternalhit|embedly|preview|curl|wget|python-requests|headless|lighthouse|monitor|uptime/i;

export async function POST(req: NextRequest) {
    try {
        let body: { path?: unknown; referrer?: unknown } = {};
        try {
            body = await req.json();
        } catch {
            // tolerate an empty / malformed body — handled by validation below
        }

        const path = typeof body.path === 'string' ? body.path.trim().slice(0, 512) : '';
        if (!path || !path.startsWith('/')) {
            return NextResponse.json({ success: false, error: 'invalid path' }, { status: 400 });
        }
        // Never record admin traffic (defense in depth; client also skips it).
        if (path.startsWith('/admin')) {
            return NextResponse.json({ success: true, skipped: 'admin' });
        }

        const userAgent = (req.headers.get('user-agent') || '').slice(0, 1024);
        const referrer =
            typeof body.referrer === 'string' && body.referrer.trim()
                ? body.referrer.trim().slice(0, 1024)
                : req.headers.get('referer') || null;
        // No UA = almost certainly a script/scraper → flag as bot.
        const isBot = !userAgent || BOT_RE.test(userAgent);

        const { error } = await supabaseAdmin.from('page_views').insert({
            path,
            referrer,
            user_agent: userAgent || null,
            is_bot: isBot,
        });

        if (error) {
            await logError({
                source: 'api.track',
                errorMessage: `page_views insert failed: ${error.message}`,
                context: { path },
            }).catch(() => {});
            return NextResponse.json({ success: false }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        await logError({ source: 'api.track', errorMessage: `track route threw: ${message}` }).catch(() => {});
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
