import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logError } from '@/lib/logging/structured-logger';

export const dynamic = 'force-dynamic';

/**
 * Public, unauthenticated conversion-event recorder — the funnel counterpart to
 * /api/track (which only records page views). Logs the moments that actually
 * matter for revenue: email signups, add-to-cart, checkout starts, purchases,
 * and CTA clicks, with any UTM attribution captured on the landing page.
 *
 * Writes via the service-role client (every table here is RLS-locked with no
 * policies, so anon inserts are silently denied). Bot flag + user-agent are
 * derived server-side from real headers, never trusted from the client. Not in
 * middleware's matcher, so it stays public. Fire-and-forget: never blocks a
 * user flow, and a failure here must never surface to the browser.
 */

const BOT_RE =
    /bot|crawl|spider|slurp|google|baidu|bing|msn|teoma|yandex|duckduck|facebookexternalhit|embedly|preview|curl|wget|python-requests|headless|lighthouse|monitor|uptime/i;

// Only these event types are accepted; anything else is rejected so the table
// stays a clean, queryable funnel rather than a dumping ground.
const ALLOWED = new Set([
    'email_signup',
    'add_to_cart',
    'checkout_start',
    'purchase',
    'cta_click',
    'related_click',
    'merch_click',
]);

const str = (v: unknown, max: number): string | null =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

export async function POST(req: NextRequest) {
    try {
        let body: Record<string, unknown> = {};
        try {
            body = await req.json();
        } catch {
            // tolerate empty/malformed body — validation below handles it
        }

        const type = str(body.type, 64);
        if (!type || !ALLOWED.has(type)) {
            return NextResponse.json({ success: false, error: 'invalid event type' }, { status: 400 });
        }

        const path = str(body.path, 512);
        // Never record admin traffic (defense in depth; client also skips it).
        if (path && path.startsWith('/admin')) {
            return NextResponse.json({ success: true, skipped: 'admin' });
        }

        const utm = (body.utm && typeof body.utm === 'object' ? body.utm : {}) as Record<string, unknown>;
        const value =
            typeof body.value === 'number' && Number.isFinite(body.value)
                ? Math.max(0, Math.min(body.value, 1_000_000))
                : null;

        const userAgent = (req.headers.get('user-agent') || '').slice(0, 1024);
        const referrer = str(body.referrer, 1024) || req.headers.get('referer') || null;
        const isBot = !userAgent || BOT_RE.test(userAgent);

        const { error } = await supabaseAdmin.from('events').insert({
            event_type: type,
            path,
            referrer,
            utm_source: str(utm.source, 128),
            utm_medium: str(utm.medium, 128),
            utm_campaign: str(utm.campaign, 128),
            utm_content: str(utm.content, 128),
            utm_term: str(utm.term, 128),
            value,
            meta: body.meta && typeof body.meta === 'object' ? body.meta : null,
            user_agent: userAgent || null,
            is_bot: isBot,
        });

        if (error) {
            await logError({
                source: 'api.event',
                errorMessage: `events insert failed: ${error.message}`,
                context: { type },
            }).catch(() => {});
            return NextResponse.json({ success: false }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        await logError({ source: 'api.event', errorMessage: `event route threw: ${message}` }).catch(() => {});
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
