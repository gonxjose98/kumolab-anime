import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Signed-upload-URL issuer. Lets the browser PUT large files directly
 * to Supabase Storage WITHOUT needing storage RLS to grant the
 * authenticated role insert rights — this route is admin-gated by
 * middleware, so reaching it implies admin auth, and the signed URL
 * carries its own short-lived auth.
 *
 * Request:  { mediaType: 'video' | 'image', filename: string }
 * Response: { signedUrl, path, publicUrl }
 *
 * Browser then does:
 *   await fetch(signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
 *
 * After upload, the browser passes `publicUrl` to /upload-and-publish.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const { mediaType, filename } = body || {};

        if (mediaType !== 'video' && mediaType !== 'image') {
            return NextResponse.json({ success: false, error: 'mediaType must be "video" or "image"' }, { status: 400 });
        }
        if (!filename || typeof filename !== 'string') {
            return NextResponse.json({ success: false, error: 'filename is required' }, { status: 400 });
        }

        const bucket = mediaType === 'video' ? 'blog-videos' : 'blog-images';
        const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 60) || 'upload';
        const path = `manual-uploads/${Date.now()}-${safeName}`;

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
