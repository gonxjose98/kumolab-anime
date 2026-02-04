import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
        const { data, error } = await supabaseAdmin
            .from('posts')
            .select('*')
            .eq('id', id)
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json(data);
    }

    // Use admin client for consistent server-side filtering and to bypass any RLS issues
    const { data, error } = await supabaseAdmin
        .from('posts')
        .select('*')
        .eq('is_published', true) // PUBLIC ENDPOINT: ALWAYS FILTER BY is_published
        .order('timestamp', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Post ID is required' }, { status: 400 });
    }

    const { data: post } = await supabaseAdmin
        .from('posts')
        .select('slug')
        .eq('id', id)
        .single();

    const { error } = await supabaseAdmin
        .from('posts')
        .delete()
        .eq('id', id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (post?.slug) {
        revalidatePath('/');
        revalidatePath('/blog');
        revalidatePath(`/blog/${post.slug}`);
    }

    return NextResponse.json({ success: true });
}

export async function PUT(req: NextRequest) {
    try {
        const body = await req.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ error: 'Post ID is required' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('posts')
            .update(updates)
            .eq('id', id);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Fetch the slug to revalidate the specific post page
        const { data: post } = await supabaseAdmin
            .from('posts')
            .select('slug')
            .eq('id', id)
            .single();

        if (post?.slug) {
            revalidatePath('/');
            revalidatePath('/blog');
            revalidatePath(`/blog/${post.slug}`);
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
}
