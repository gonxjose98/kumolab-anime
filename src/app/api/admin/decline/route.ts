import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
    console.log('[Decline API] Called');
    try {
        const { postIds, reason } = await req.json();
        console.log('[Decline API] Received postIds:', postIds);

        if (!postIds || !Array.isArray(postIds)) {
            console.log('[Decline API] Invalid postIds');
            return NextResponse.json({ success: false, error: 'Invalid postIds' }, { status: 400 });
        }

        const now = new Date();
        const results = [];

        for (const postId of postIds) {
            console.log(`[Decline API] Processing post: ${postId}`);
            
            // 1. Get post details first
            const { data: post, error: fetchError } = await supabaseAdmin
                .from('posts')
                .select('*')
                .eq('id', postId)
                .single();

            if (fetchError || !post) {
                console.error(`[Decline API] Post not found: ${postId}`, fetchError);
                results.push({ id: postId, success: false, error: 'Post not found' });
                continue;
            }

            console.log(`[Decline API] Found post: ${post.title}`);

            // 2. Insert into declined_posts
            console.log(`[Decline API] Inserting into declined_posts`);
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
                console.error(`[Decline API] Insert error:`, insertError);
                results.push({ id: postId, success: false, error: insertError.message });
                continue;
            }

            console.log(`[Decline API] Inserted into declined_posts`);

            // 3. Mark detection_candidates as discarded to prevent recreation
            console.log(`[Decline API] Marking detection_candidates as discarded`);
            if (post.fingerprint) {
                const { error: candidateError } = await supabaseAdmin
                    .from('detection_candidates')
                    .update({ 
                        status: 'discarded',
                        processed_at: now.toISOString(),
                        action_taken: 'declined',
                        error_message: `Post declined by admin: ${reason || 'No reason given'}`
                    })
                    .eq('fingerprint', post.fingerprint);
                
                if (candidateError) {
                    console.error(`[Decline API] Failed to mark candidate discarded:`, candidateError);
                } else {
                    console.log(`[Decline API] Marked candidate as discarded for fingerprint: ${post.fingerprint}`);
                }
            }

            // 4. Delete from posts
            console.log(`[Decline API] Deleting from posts`);
            const { error: deleteError, data: deleteData } = await supabaseAdmin
                .from('posts')
                .delete()
                .eq('id', postId)
                .select();

            if (deleteError) {
                console.error(`[Decline API] Delete error:`, deleteError);
                results.push({ id: postId, success: false, error: deleteError.message });
            } else {
                console.log(`[Decline API] Successfully deleted post: ${postId}`, deleteData);
                results.push({ id: postId, success: true });
            }
        }

        console.log('[Decline API] Results:', results);
        return NextResponse.json({ success: true, results });
    } catch (e: any) {
        console.error('[Decline API] Fatal error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
