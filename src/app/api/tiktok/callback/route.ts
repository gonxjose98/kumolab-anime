import { NextRequest, NextResponse } from 'next/server';
import { connectTikTok, syncTikTokTile } from '@/lib/social/tiktok-api';

// TikTok Login Kit redirect. The consent screen sends ?code=&state= here; we
// check state against the pending value in oauth_tokens, store the tokens,
// and run one tile sync so the result is visible right away. No token is
// ever rendered back to the page.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const p = req.nextUrl.searchParams;
    const code = p.get('code');
    const state = p.get('state');
    if (p.get('error')) return page(`TikTok said: ${p.get('error')} ${p.get('error_description') || ''}`, false);
    if (!code || !state) return page('Missing code or state.', false);
    try {
        await connectTikTok(code, state);
        const s = await syncTikTokTile();
        return page(`Connected. Tile updated: ${s.views.toLocaleString()} views, ${s.followers} followers, ${s.likes.toLocaleString()} likes, ${s.posts} posts.`, true);
    } catch (e: any) {
        return page(String(e?.message || e).slice(0, 300), false);
    }
}

function page(msg: string, ok: boolean) {
    const esc = msg.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return new NextResponse(
        `<!doctype html><html><head><title>TikTok connect</title><meta name="robots" content="noindex"></head>
<body style="font-family:system-ui;padding:2rem;max-width:640px;margin:0 auto">
<h1 style="color:${ok ? '#16a34a' : '#dc2626'}">TikTok ${ok ? 'connected' : 'connect failed'}</h1><p>${esc}</p></body></html>`,
        { status: ok ? 200 : 400, headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
}
