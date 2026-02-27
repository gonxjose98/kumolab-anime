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

        // Get slugs for revalidation
        const { data: posts } = await supabaseAdmin
            .from('posts')
            .select('slug')
            .in('id', ids);

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
