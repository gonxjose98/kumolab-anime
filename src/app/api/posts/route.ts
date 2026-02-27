import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

// Helper to get Supabase client
function getSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const type = searchParams.get('type');
        const limit = parseInt(searchParams.get('limit') || '50');

        const supabase = getSupabase();

        let query = supabase
            .from('posts')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(limit);

        if (status) query = query.eq('status', status);
        if (type) query = query.eq('type', type);

        const { data, error } = await query;

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Post ID required' }, { status: 400 });
        }

        const supabase = getSupabase();

        // Get slug for revalidation
        const { data: post } = await supabase
            .from('posts')
            .select('slug')
            .eq('id', id)
            .single();

        // Delete
        const { error } = await supabase
            .from('posts')
            .delete()
            .eq('id', id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Revalidate
        try {
            revalidatePath('/');
            revalidatePath('/blog');
            if (post?.slug) revalidatePath(`/blog/${post.slug}`);
        } catch {}

        return NextResponse.json({ success: true, message: 'Deleted' });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
