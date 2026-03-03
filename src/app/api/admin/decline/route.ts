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

            // 2. Try to insert into declined_posts for tracking (non-blocking)
            // If the table doesn't exist, we still proceed with deletion
            try {
                await supabaseAdmin
                    .from('declined_posts')
                    .insert([{
                        original_post_id: post.id,
                        title: post.title,
                        slug: post.slug,
                        source: post.source || 'Unknown',
                        declined_at: now.toISOString(),
                        declined_by: 'admin',
                        reason: reason || ''
                    }]);
            } catch (insertErr) {
                // Non-blocking — table may not exist yet
                console.warn('[Decline] Could not insert into declined_posts:', insertErr);
            }

            // 3. Delete from posts table — this is the critical operation
            const { error: deleteError } = await supabaseAdmin
                .from('posts')
                .delete()
                .eq('id', postId);

            if (deleteError) {
                console.error(`[Decline] Failed to delete post ${postId}:`, deleteError);
                results.push({ id: postId, success: false, error: deleteError.message });
            } else {
                console.log(`[Decline] Successfully deleted post: ${post.title}`);
                results.push({ id: postId, success: true });
            }
        }

        const allSuccess = results.every(r => r.success);
        return NextResponse.json({ success: allSuccess, results });
    } catch (e: any) {
        console.error('[Decline] Error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
