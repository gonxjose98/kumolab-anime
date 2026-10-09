import { NextRequest, NextResponse } from 'next/server';
import { verifyX, xConfigured, uploadMediaFromUrl } from '@/lib/social/x-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Confirms the X keys work by reading the authed account. Returns the handle
// and counts only, never the keys. One owned read (~$0.001).
// ?media=<our storage URL>&kind=image|video runs an upload-only dry run (no post).
export async function GET(req: NextRequest) {
    if (!xConfigured()) return NextResponse.json({ ok: false, error: 'X keys not set' }, { status: 503 });
    try {
        const media = req.nextUrl.searchParams.get('media');
        if (media) {
            const allowed = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`;
            if (!media.startsWith(allowed)) return NextResponse.json({ ok: false, error: 'media must be a KumoLab storage URL' }, { status: 400 });
            const kind = req.nextUrl.searchParams.get('kind') === 'video' ? 'video' : 'image';
            const t0 = Date.now();
            const mediaId = await uploadMediaFromUrl(media, kind);
            return NextResponse.json({ ok: true, dryRun: true, kind, mediaId, ms: Date.now() - t0 });
        }
        const me = await verifyX();
        return NextResponse.json({ ok: true, autoPublish: process.env.X_AUTO_PUBLISH === 'true', ...me });
    } catch (e: any) {
        // 200 on purpose: Cloudflare replaces 5xx bodies, hiding the X error.
        return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 300) }, { status: 200 });
    }
}
