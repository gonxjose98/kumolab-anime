import { NextRequest, NextResponse } from 'next/server';

// Same-origin passthrough for our own Storage files, so the admin can fetch
// slides/reels as blobs for "Save to Photos". iOS Safari blocks the direct
// cross-origin fetch ("Load failed"), same-origin always works. Locked to our
// public Storage bucket URLs so it can't be used to fetch arbitrary sites.
// Auth: /api/admin/* requires an admin session (middleware).
const ALLOWED_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`;

export async function GET(req: NextRequest) {
    const url = req.nextUrl.searchParams.get('url') || '';
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !url.startsWith(ALLOWED_PREFIX) || url.includes('..')) {
        return NextResponse.json({ error: 'url not allowed' }, { status: 400 });
    }
    const upstream = await fetch(url, { cache: 'no-store' });
    if (!upstream.ok || !upstream.body) {
        return NextResponse.json({ error: `upstream ${upstream.status}` }, { status: 502 });
    }
    return new NextResponse(upstream.body, {
        status: 200,
        headers: {
            'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
            ...(upstream.headers.get('content-length') ? { 'Content-Length': upstream.headers.get('content-length')! } : {}),
            'Cache-Control': 'private, max-age=600',
        },
    });
}
