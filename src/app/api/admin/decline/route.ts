
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
    try {
        const { postIds, reason } = await req.json();

        if (!postIds || !Array.isArray(postIds)) {
            return NextResponse.json({ success: false, error: 'Invalid postIds' }, { status: 400 });
        }

        const now = new Date();
        const results = [];

        for (const postId of postIds) {
            // 1. Get post details first
            const { data: post, error: fetchError } = await supabaseAdmin
                .from('posts')
                .select('*')
                .eq('id', postId)
                .single();

            if (fetchError || !post) {
                results.push({ id: postId, success: false, error: 'Post not found' });
                continue;
            }

            // 2. Insert into declined_posts
            const { error: insertError } = await supabaseAdmin
                .from('declined_posts')
                .insert([{
                    original_post_id: post.id,
                    title: post.title,
                    source: post.source || 'Unknown',
                    declined_at: now.toISOString(),
                    declined_by: 'admin',
                    reason: reason || ''
                }]);

            if (insertError) {
                results.push({ id: postId, success: false, error: insertError.message });
                continue;
            }

            // 3. Delete from posts (or mark as declined? User said "removes from pending")
            const { error: deleteError } = await supabaseAdmin
                .from('posts')
                .delete()
                .eq('id', postId);

            if (deleteError) {
                results.push({ id: postId, success: false, error: deleteError.message });
            } else {
                results.push({ id: postId, success: true });
            }
        }

        return NextResponse.json({ success: true, results });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
