import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const type = searchParams.get('type');
        const limit = parseInt(searchParams.get('limit') || '50');

        let query = supabaseAdmin
            .from('posts')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(limit);

        if (status) {
            query = query.eq('status', status);
        }

        if (type) {
            query = query.eq('type', type);
        }

        const { data: posts, error } = await query;

        if (error) {
            console.error('[API] GET error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(posts);
    } catch (err: any) {
        console.error('[API] GET exception:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        // Check env vars first
        if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
            console.error('[API] Missing Supabase env vars');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Post ID is required' }, { status: 400 });
        }

        console.log(`[API] Deleting post: ${id}`);

        // Get post info for revalidation (optional)
        const { data: post, error: fetchError } = await supabaseAdmin
            .from('posts')
            .select('slug')
            .eq('id', id)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
            console.error('[API] Fetch error:', fetchError);
        }

        // Delete the post
        const { error } = await supabaseAdmin
            .from('posts')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[API] Delete error:', error);
            return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
        }

        console.log(`[API] Successfully deleted post: ${id}`);

        // Try to revalidate, but don't fail if it errors
        try {
            if (post?.slug) {
                revalidatePath('/');
                revalidatePath('/blog');
                revalidatePath(`/blog/${post.slug}`);
            }
        } catch (revError) {
            console.error('[API] Revalidation error (non-critical):', revError);
        }

        return NextResponse.json({ success: true, message: 'Post deleted' });
    } catch (err: any) {
        console.error('[API] DELETE exception:', err);
        return NextResponse.json({ error: err.message || 'Delete failed', stack: err.stack }, { status: 500 });
    }
}
