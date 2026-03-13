import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logAction } from '@/lib/logging/structured-logger';

export async function POST(req: NextRequest) {
    try {
        const { postIds, reason } = await req.json();

        if (!postIds || !Array.isArray(postIds) || postIds.length === 0) {
            return NextResponse.json({ success: false, error: 'Invalid postIds' }, { status: 400 });
        }

        console.log(`[Decline] Processing ${postIds.length} post(s)...`);
        const now = new Date();
        const results = [];

        for (const postId of postIds) {
            // 1. Fetch the post first
            const { data: post, error: fetchError } = await supabaseAdmin
                .from('posts')
                .select('*')
                .eq('id', postId)
                .single();

            if (fetchError || !post) {
                console.error(`[Decline] Post ${postId} not found:`, fetchError?.message);
                results.push({ id: postId, success: false, error: 'Post not found' });
                continue;
            }

            // 2. Delete from posts FIRST (before inserting into declined_posts to avoid FK issues)
            const { data: deletedRows, error: deleteError } = await supabaseAdmin
                .from('posts')
                .delete()
                .eq('id', postId)
                .select('id');

            if (deleteError) {
                console.error(`[Decline] DELETE failed for "${post.title}":`, deleteError.message);

                // Fallback: if delete fails (e.g. RLS), try updating status instead
                const { error: updateError } = await supabaseAdmin
                    .from('posts')
                    .update({ status: 'declined', is_published: false })
                    .eq('id', postId);

                if (updateError) {
                    console.error(`[Decline] UPDATE fallback also failed:`, updateError.message);
                    results.push({ id: postId, success: false, error: deleteError.message });
                } else {
                    console.log(`[Decline] Fallback: marked "${post.title}" as declined (not deleted)`);
                    results.push({ id: postId, success: true, method: 'status_update' });
                }
                continue;
            }

            // 3. Verify the delete actually removed a row
            if (!deletedRows || deletedRows.length === 0) {
                console.error(`[Decline] DELETE returned 0 rows for "${post.title}" — likely RLS blocking`);

                // Fallback: update status
                const { error: updateError } = await supabaseAdmin
                    .from('posts')
                    .update({ status: 'declined', is_published: false })
                    .eq('id', postId);

                if (updateError) {
                    results.push({ id: postId, success: false, error: 'Delete silent failure + update failed' });
                } else {
                    console.log(`[Decline] Fallback: marked "${post.title}" as declined`);
                    results.push({ id: postId, success: true, method: 'status_update' });
                }
                continue;
            }

            console.log(`[Decline] Deleted "${post.title}" (verified)`);

            // 4. Record in declined_posts for future dedup (non-blocking, best-effort)
            const { error: trackError } = await supabaseAdmin
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

            if (trackError) {
                // Non-critical — table may not exist
                console.warn(`[Decline] Could not track in declined_posts:`, trackError.message);
            }

            results.push({ id: postId, success: true, method: 'deleted' });
            await logAction({ action: 'declined', entityId: postId, actor: 'Admin', reason: reason || 'No reason provided' });
        }

        // Bust Next.js cache so refresh shows correct data
        revalidatePath('/admin/dashboard');
        revalidatePath('/blog');

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;
        console.log(`[Decline] Done. Success: ${successCount}, Failed: ${failCount}`);

        return NextResponse.json({
            success: failCount === 0,
            results,
            summary: { success: successCount, failed: failCount }
        });
    } catch (e: any) {
        console.error('[Decline] Unhandled error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
