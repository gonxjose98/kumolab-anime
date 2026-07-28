import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { resolveUploadTarget } from '@/lib/supabase/upload-target';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Signed-upload-URL issuer. Lets the browser PUT large files directly
 * to Supabase Storage WITHOUT needing storage RLS to grant the
 * authenticated role insert rights — this route is admin-gated by
 * middleware, so reaching it implies admin auth, and the signed URL
 * carries its own short-lived auth.
 *
 * Request:  { mediaType: 'video' | 'image', filename: string,
 *             destination?: 'post' | 'library' }
 * Response: { signedUrl, path, publicUrl }
 *
 * Browser then does:
 *   await fetch(signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
 *
 * After upload, the browser passes `publicUrl` to /upload-and-publish.
 *
 * `destination` picks the bucket:
 *   'post' (default) → blog-videos / blog-images. Transient post footage; the
 *                      cleanup worker slims blog-videos on a schedule.
 *   'library'        → studio-library. Curated media the operator filed into a
 *                      folder. A separate bucket precisely so that sweep can
 *                      never reach it (see the bucket migration).
 * Omitting it preserves the original behaviour exactly.
 */

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { mediaType, filename, destination } = body || {};

        if (mediaType !== 'video' && mediaType !== 'image') {
            return NextResponse.json({ success: false, error: 'mediaType must be "video" or "image"' }, { status: 400 });
        }
        if (!filename || typeof filename !== 'string') {
            return NextResponse.json({ success: false, error: 'filename is required' }, { status: 400 });
        }
        if (destination !== undefined && destination !== 'post' && destination !== 'library') {
            return NextResponse.json({ success: false, error: 'destination must be "post" or "library"' }, { status: 400 });
        }

        const { bucket, prefix } = resolveUploadTarget(destination, mediaType);
        // Preserve the file extension. iOS reels often have 80+ char names —
        // we shorten the BASE but keep the ext intact so the public URL ends
        // in .mov / .mp4 / .jpg etc. Without an ext, the admin <video> tag
        // can't reliably show a poster frame on Safari.
        const dot = filename.lastIndexOf('.');
        const ext = dot >= 0 ? filename.slice(dot).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 8) : '';
        const base = (dot >= 0 ? filename.slice(0, dot) : filename)
            .replace(/[^a-zA-Z0-9-]/g, '_')
            .slice(0, 50) || 'upload';
        const path = `${prefix}/${Date.now()}-${base}${ext}`;

        const { data, error } = await supabaseAdmin
            .storage
            .from(bucket)
            .createSignedUploadUrl(path);

        if (error || !data) {
            return NextResponse.json({ success: false, error: error?.message || 'sign failed' }, { status: 500 });
        }

        const { data: { publicUrl } } = supabaseAdmin.storage.from(bucket).getPublicUrl(path);

        return NextResponse.json({
            success: true,
            signedUrl: data.signedUrl,
            token: data.token,
            path,
            bucket,
            publicUrl,
        });
    } catch (e: any) {
        console.error('[upload-sign] error', e);
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
