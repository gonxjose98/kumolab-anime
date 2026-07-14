/**
 * Public one-click unsubscribe. GET ?token=<unsubscribe_token> flips the
 * subscriber to 'unsubscribed' and shows a friendly page. Deliberately
 * neutral on bad or unknown tokens (never leaks whether an email exists)
 * and idempotent: clicking the link twice is fine.
 *
 * POST is accepted too (RFC 8058 List-Unsubscribe-Post one-click).
 */

import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function page(heading: string, sub: string) {
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>KumoLab</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: linear-gradient(180deg, #0b1220 0%, #16223a 100%); color: #f3ede0;
         font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; }
  .card { max-width: 420px; padding: 40px 28px; }
  h1 { font-size: 22px; margin: 0 0 10px; color: #ffd76e; }
  p { font-size: 15px; line-height: 1.6; margin: 0 0 22px; color: rgba(243, 237, 224, 0.85); }
  a { color: #ffd76e; text-decoration: none; border-bottom: 1px solid rgba(255, 215, 110, 0.4); padding-bottom: 1px; }
</style>
</head>
<body>
  <div class="card">
    <h1>${heading}</h1>
    <p>${sub}</p>
    <a href="/">Back to KumoLab</a>
  </div>
</body>
</html>`;
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

async function unsubscribe(req: Request) {
    const token = new URL(req.url).searchParams.get('token') ?? '';

    if (UUID_RE.test(token)) {
        try {
            await supabaseAdmin
                .from('email_subscribers')
                .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
                .eq('unsubscribe_token', token)
                .neq('status', 'unsubscribed');
        } catch (e) {
            console.error('Unsubscribe update failed:', e);
        }
    }

    // Always the same friendly page, valid token or not.
    return page(
        "You've been unsubscribed from KumoLab.",
        "You won't receive any more emails from us. If this was a mistake, you can sign up again on the homepage anytime.",
    );
}

export async function GET(req: Request) {
    return unsubscribe(req);
}

export async function POST(req: Request) {
    return unsubscribe(req);
}
