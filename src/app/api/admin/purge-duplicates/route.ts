import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST() {
    try {
        console.log('[Purge] Starting duplicate purge...');

        // Fetch all posts
        const { data: posts, error } = await supabaseAdmin
            .from('posts')
            .select('id, title, slug, timestamp, status, is_published, source')
            .order('timestamp', { ascending: true });

        if (error || !posts) {
            return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch posts' }, { status: 500 });
        }

        console.log(`[Purge] Total posts: ${posts.length}`);

        // Group by normalized title to find duplicates
        const groups = new Map<string, typeof posts>();

        for (const post of posts) {
            const normalized = post.title
                .toLowerCase()
                .replace(/[^\w\s]/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            if (!groups.has(normalized)) {
                groups.set(normalized, []);
            }
            groups.get(normalized)!.push(post);
        }

        // Find IDs to delete (keep the first/oldest of each group)
        const idsToDelete: string[] = [];

        for (const [title, group] of groups) {
            if (group.length <= 1) continue;

            // Sort: prefer published > approved > pending, then by oldest first
            group.sort((a, b) => {
                const statusOrder: Record<string, number> = { published: 0, approved: 1, pending: 2 };
                const aOrder = statusOrder[a.status] ?? 3;
                const bOrder = statusOrder[b.status] ?? 3;
                if (aOrder !== bOrder) return aOrder - bOrder;
                return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
            });

            // Keep first, delete rest
            const toDelete = group.slice(1);
            for (const post of toDelete) {
                idsToDelete.push(post.id);
            }

            console.log(`[Purge] "${title.substring(0, 50)}..." — keeping 1, deleting ${toDelete.length}`);
        }

        if (idsToDelete.length === 0) {
            return NextResponse.json({ success: true, deleted: 0, remaining: posts.length });
        }

        console.log(`[Purge] Deleting ${idsToDelete.length} duplicate posts...`);

        // Delete in batches of 50
        let deleted = 0;
        for (let i = 0; i < idsToDelete.length; i += 50) {
            const batch = idsToDelete.slice(i, i + 50);
            const { error: deleteError } = await supabaseAdmin
                .from('posts')
                .delete()
                .in('id', batch);

            if (deleteError) {
                console.error(`[Purge] Batch delete error:`, deleteError);
            } else {
                deleted += batch.length;
            }
        }

        const remaining = posts.length - deleted;
        console.log(`[Purge] Complete. Deleted: ${deleted}, Remaining: ${remaining}`);

        return NextResponse.json({ success: true, deleted, remaining });
    } catch (e: any) {
        console.error('[Purge] Error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
