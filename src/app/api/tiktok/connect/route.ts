import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { TIKTOK_REDIRECT_URI } from '@/lib/social/tiktok-api';

// Starts the TikTok consent flow: stores a fresh CSRF state, then sends the
// browser to TikTok's authorize page. The app is in Sandbox, so only the
// target user (@kumolab.anime) can complete it.

export const dynamic = 'force-dynamic';

export async function GET() {
    const key = process.env.TIKTOK_CLIENT_KEY;
    if (!key) return new NextResponse('TIKTOK_CLIENT_KEY not set', { status: 500 });
    const state = randomBytes(16).toString('hex');
    const { error } = await supabaseAdmin.from('oauth_tokens').upsert({ provider: 'tiktok', state });
    if (error) return new NextResponse(`state save failed: ${error.message}`, { status: 500 });
    const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
    url.searchParams.set('client_key', key);
    url.searchParams.set('scope', 'user.info.basic,user.info.stats,video.list');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', TIKTOK_REDIRECT_URI);
    url.searchParams.set('state', state);
    return NextResponse.redirect(url.toString());
}
