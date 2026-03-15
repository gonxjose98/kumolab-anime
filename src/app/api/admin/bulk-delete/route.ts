import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { ids } = await req.json();

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ error: 'Array of IDs required' }, { status: 400 });
        }

        console.log(`[API] Bulk deleting ${ids.length} posts`);

        // Fetch posts BEFORE deleting — we need title, slug, source, source_url for tracking
        const { data: posts } = await supabaseAdmin
            .from('posts')
            .select('id, title, slug, source, source_url')
            .in('id', ids);

        // Record in declined_posts so the scraper doesn't re-detect them
        if (posts && posts.length > 0) {
            const now = new Date().toISOString();
            const declinedRecords = posts.map((post: any) => ({
                original_post_id: post.id,
                title: post.title || '',
                slug: post.slug || '',
                source: post.source || 'Unknown',
                source_url: post.source_url || '',
                declined_at: now,
                declined_by: 'admin',
                reason: 'bulk_deleted'
            }));

            const { error: trackError } = await supabaseAdmin
                .from('declined_posts')
                .insert(declinedRecords);

            if (trackError) {
                console.warn(`[API] Could not track ${declinedRecords.length} deleted posts in declined_posts:`, trackError.message);
            } else {
                console.log(`[API] Tracked ${declinedRecords.length} posts in declined_posts`);
            }
        }

        // Delete posts
        const { error } = await supabaseAdmin
            .from('posts')
            .delete()
            .in('id', ids);

        if (error) {
            console.error('[API] Bulk delete error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        console.log(`[API] Successfully deleted ${ids.length} posts`);

        // Revalidate paths
        try {
            revalidatePath('/');
            revalidatePath('/blog');
            if (posts) {
                posts.forEach((post: any) => {
                    if (post.slug) revalidatePath(`/blog/${post.slug}`);
                });
            }
        } catch (revError) {
            console.error('[API] Revalidation error (non-critical):', revError);
        }

        return NextResponse.json({
            success: true,
            message: `Deleted ${ids.length} posts`,
            deleted: ids.length
        });
    } catch (err: any) {
        console.error('[API] Bulk delete exception:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
