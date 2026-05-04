import { NextRequest, NextResponse } from 'next/server';

// Threads OAuth callback. The Threads consent flow at threads.net redirects
// here with `?code=<auth-code>&state=<our-state>`. We exchange the auth
// code for a short-lived user token, then exchange short→long-lived
// (60-day) and render both back into the page so the operator can copy
// them into Vercel env. This is a one-time-use endpoint.
//
// Threads app credentials live in env (THREADS_APP_ID + THREADS_APP_SECRET);
// the long-lived token + user_id we capture here become THREADS_ACCESS_TOKEN
// + THREADS_USER_ID, used by publisher.ts.

export const dynamic = 'force-dynamic';

const SHORT_LIVED_TOKEN_URL = 'https://graph.threads.net/oauth/access_token';
const LONG_LIVED_TOKEN_URL = 'https://graph.threads.net/access_token';

export async function GET(req: NextRequest) {
    const code = req.nextUrl.searchParams.get('code');
    const error = req.nextUrl.searchParams.get('error');
    const errorDesc = req.nextUrl.searchParams.get('error_description') || '';

    if (error) {
        return new NextResponse(
            renderHtml(`Threads OAuth error: ${error}\n\n${errorDesc}`, 'error'),
            { status: 400, headers: { 'content-type': 'text/html; charset=utf-8' } },
        );
    }
    if (!code) {
        return new NextResponse(renderHtml('Missing ?code= parameter', 'error'), {
            status: 400,
            headers: { 'content-type': 'text/html; charset=utf-8' },
        });
    }

    const appId = process.env.THREADS_APP_ID;
    const appSecret = process.env.THREADS_APP_SECRET;
    const redirectUri = 'https://kumolabanime.com/api/oauth/threads/callback';

    if (!appId || !appSecret) {
        return new NextResponse(
            renderHtml('THREADS_APP_ID and THREADS_APP_SECRET must be set in Vercel env first.', 'error'),
            { status: 500, headers: { 'content-type': 'text/html; charset=utf-8' } },
        );
    }

    try {
        // Step 1: exchange auth code → short-lived token (~1 hour)
        const shortRes = await fetch(SHORT_LIVED_TOKEN_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: appId,
                client_secret: appSecret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri,
            }),
        });
        const shortData = await shortRes.json();
        if (!shortData.access_token) {
            return new NextResponse(
                renderHtml(`Short-lived exchange failed:\n${JSON.stringify(shortData, null, 2)}`, 'error'),
                { status: 502, headers: { 'content-type': 'text/html; charset=utf-8' } },
            );
        }

        // Step 2: exchange short → long-lived (60-day)
        const longUrl = new URL(LONG_LIVED_TOKEN_URL);
        longUrl.searchParams.set('grant_type', 'th_exchange_token');
        longUrl.searchParams.set('client_secret', appSecret);
        longUrl.searchParams.set('access_token', shortData.access_token);
        const longRes = await fetch(longUrl);
        const longData = await longRes.json();
        if (!longData.access_token) {
            return new NextResponse(
                renderHtml(`Long-lived exchange failed:\n${JSON.stringify(longData, null, 2)}`, 'error'),
                { status: 502, headers: { 'content-type': 'text/html; charset=utf-8' } },
            );
        }

        const expiresInDays = Math.floor((longData.expires_in || 0) / 86400);
        const successBody = [
            'THREADS_USER_ID=' + shortData.user_id,
            'THREADS_ACCESS_TOKEN=' + longData.access_token,
            '',
            `expires_in: ${longData.expires_in}s (~${expiresInDays} days)`,
            `token_type: ${longData.token_type}`,
        ].join('\n');

        return new NextResponse(renderHtml(successBody, 'success'), {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
        });
    } catch (e: any) {
        return new NextResponse(renderHtml(`Threw: ${e?.message || e}`, 'error'), {
            status: 500,
            headers: { 'content-type': 'text/html; charset=utf-8' },
        });
    }
}

function renderHtml(body: string, kind: 'success' | 'error') {
    const color = kind === 'success' ? '#22c55e' : '#ef4444';
    return `<!doctype html>
<html><head><title>Threads OAuth</title><meta name="robots" content="noindex"></head>
<body style="font-family: ui-monospace, monospace; padding: 2rem; max-width: 800px; margin: 0 auto; background:#0a0a0a; color:#e5e5e5;">
<h1 style="color:${color}">Threads OAuth ${kind}</h1>
<pre style="background:#1a1a1a; padding:1rem; border:1px solid #333; border-radius:6px; white-space:pre-wrap; word-break:break-all">${body.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>
<p style="color:#888;font-size:0.875rem">Copy the values above into Vercel env. Close this tab when done.</p>
</body></html>`;
}
