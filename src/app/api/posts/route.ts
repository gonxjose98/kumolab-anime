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
            let query = supabase
                .from('posts')
                .select('*');
            
            if (slug) query = query.eq('slug', slug);
            if (id) query = query.eq('id', id);

            const { data, error } = await query.single();
            
            if (error) {
                console.error('Error fetching post:', error);
                return NextResponse.json({ error: 'Post not found' }, { status: 404 });
            }
            
            if (!data) {
                return NextResponse.json({ error: 'Post not found' }, { status: 404 });
            }
            
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

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Post ID required' }, { status: 400 });
        }

        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error } = await supabase
            .from('posts')
            .delete()
            .eq('id', id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Post deleted' });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
