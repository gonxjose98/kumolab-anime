import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const type = searchParams.get('type');
        const limit = parseInt(searchParams.get('limit') || '50');
        const slug = searchParams.get('slug');
        const id = searchParams.get('id');

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // If slug or id is provided, fetch single post
        if (slug || id) {
            console.log('[API /posts] Fetching single post:', { slug, id });
            
            let query = supabase
                .from('posts')
                .select('*');
            
            if (slug) query = query.eq('slug', slug);
            if (id) query = query.eq('id', id);

            const { data, error } = await query.single();
            
            if (error) {
                console.error('[API /posts] Error fetching post:', error);
                return NextResponse.json({ error: 'Post not found' }, { status: 404 });
            }
            
            if (!data) {
                console.log('[API /posts] Post not found');
                return NextResponse.json({ error: 'Post not found' }, { status: 404 });
            }
            
            console.log('[API /posts] Post found:', {
                id: data.id,
                slug: data.slug,
                is_published: data.is_published,
                status: data.status
            });
            
            return NextResponse.json(data);
        }

        // Otherwise, fetch list of posts
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

export async function PUT(req: NextRequest) {
    try {
        const body = await req.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ success: false, error: 'Post ID required' }, { status: 400 });
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Only allow safe fields to be updated
        const allowedFields = ['status', 'is_published', 'scheduled_post_time', 'title', 'content', 'image', 'type', 'timestamp'];
        const safeUpdates: Record<string, any> = {};
        for (const key of allowedFields) {
            if (key in updates) {
                safeUpdates[key] = updates[key];
            }
        }

        if (Object.keys(safeUpdates).length === 0) {
            return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('posts')
            .update(safeUpdates)
            .eq('id', id)
            .select();

        if (error) {
            console.error('[API /posts PUT] Error:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, data });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Post ID required' }, { status: 400 });
        }

        // Use supabaseAdmin to ensure service_role key (bypasses RLS)
        const { supabaseAdmin } = await import('@/lib/supabase/admin');

        // Fetch post BEFORE deleting to track it
        const { data: post } = await supabaseAdmin
            .from('posts')
            .select('id, title, slug, source, source_url')
            .eq('id', id)
            .single();

        // Record in declined_posts so the scraper doesn't re-detect it
        if (post) {
            await supabaseAdmin
                .from('declined_posts')
                .insert([{
                    original_post_id: post.id,
                    title: post.title || '',
                    slug: post.slug || '',
                    source: post.source || 'Unknown',
                    source_url: post.source_url || '',
                    declined_at: new Date().toISOString(),
                    declined_by: 'admin',
                    reason: 'deleted'
                }])
                .then(({ error }) => {
                    if (error) console.warn('[API] Could not track deleted post:', error.message);
                });
        }

        const { data: deleted, error } = await supabaseAdmin
            .from('posts')
            .delete()
            .eq('id', id)
            .select('id');

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        if (!deleted || deleted.length === 0) {
            return NextResponse.json({ error: 'No rows deleted — post may not exist or RLS blocked the operation' }, { status: 404 });
        }

        const { revalidatePath } = await import('next/cache');
        revalidatePath('/admin/dashboard');

        return NextResponse.json({ success: true, message: 'Post deleted' });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
