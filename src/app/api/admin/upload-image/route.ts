import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Editor image upload — accepts a multipart file, stages it under
// editor-uploads/ in the blog-images bucket, returns the public URL so the
// editor can use it as the render source. Middleware admin-gates the route.
export async function POST(req: NextRequest) {
    try {
        const form = await req.formData();
        const file = form.get('file');
        if (!(file instanceof File)) {
            return NextResponse.json({ success: false, error: 'file field is required' }, { status: 400 });
        }
        if (!file.type.startsWith('image/')) {
            return NextResponse.json({ success: false, error: 'only image uploads are allowed' }, { status: 400 });
        }
        const MAX = 8 * 1024 * 1024;
        if (file.size > MAX) {
            return NextResponse.json({ success: false, error: 'file exceeds 8 MB limit' }, { status: 413 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 80) || 'upload';
        const key = `editor-uploads/${Date.now()}-${safeName}`;

        const { error: uploadError } = await supabaseAdmin
            .storage
            .from('blog-images')
            .upload(key, buffer, { contentType: file.type, upsert: false });

        if (uploadError) {
            return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
        }

        const { data: { publicUrl } } = supabaseAdmin
            .storage
            .from('blog-images')
            .getPublicUrl(key);

        return NextResponse.json({ success: true, url: publicUrl, key });
    } catch (e: any) {
        console.error('[admin/upload-image] error', e);
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
