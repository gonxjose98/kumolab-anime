import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Clean, trustworthy bio links. Instead of pasting an ugly
 *   https://kumolabanime.com/?utm_source=instagram&utm_medium=bio
 * into a profile bio (which reads as spammy), use a tidy branded short link:
 *   https://kumolabanime.com/go/ig
 * This resolves the channel to UTM attribution, drops it in a short-lived
 * cookie (read and cleared by captureUtm on the landing page), then redirects to
 * a clean homepage URL. Result: the bio link looks legit AND the click is still
 * attributed to the channel that drove it, with no query string on the landing.
 * (The /links hub still exists and can be used directly whenever wanted.)
 */

const CHANNELS: Record<string, { source: string; medium: string }> = {
    ig: { source: 'instagram', medium: 'bio' },
    instagram: { source: 'instagram', medium: 'bio' },
    threads: { source: 'threads', medium: 'bio' },
    th: { source: 'threads', medium: 'bio' },
    fb: { source: 'facebook', medium: 'bio' },
    facebook: { source: 'facebook', medium: 'bio' },
    tt: { source: 'tiktok', medium: 'bio' },
    tiktok: { source: 'tiktok', medium: 'bio' },
    yt: { source: 'youtube', medium: 'bio' },
    youtube: { source: 'youtube', medium: 'bio' },
    x: { source: 'x', medium: 'bio' },
    twitter: { source: 'x', medium: 'bio' },
    reddit: { source: 'reddit', medium: 'bio' },
};

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ channel: string }> },
) {
    const { channel } = await params;
    const key = (channel || '').toLowerCase().slice(0, 32);
    // Unknown channels still attribute (source = the raw key) rather than 404,
    // so a new bio link never breaks even before it is added to the map above.
    const cfg = CHANNELS[key] || { source: key || 'link', medium: 'bio' };

    const res = NextResponse.redirect(new URL('/', req.nextUrl.origin), 307);
    res.cookies.set(
        'kumolab_ref',
        JSON.stringify({ source: cfg.source, medium: cfg.medium, campaign: 'bio' }),
        {
            path: '/',
            maxAge: 60 * 30, // 30 min: long enough to survive the redirect and land
            sameSite: 'lax',
            httpOnly: false, // captureUtm (client) must be able to read it
        },
    );
    return res;
}
