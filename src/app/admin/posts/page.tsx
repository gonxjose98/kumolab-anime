import PostManager from '@/components/admin/PostManager';
import { fromDbPosts } from '@/lib/posts/normalize';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * Posts manager — full list + status filter + edit + image manipulation +
 * AI Assist. Single screen for everything you'd ever do to a post.
 *
 * RLS is enabled on every table with no anon policies, so reads go through
 * supabaseAdmin (service role) the same way the dashboard does.
 */
export default async function PostsPage() {
    const { data, error } = await supabaseAdmin
        .from('posts')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(500);

    if (error) {
        return (
            <div className="max-w-3xl mx-auto py-12 text-center">
                <p className="text-sm" style={{ color: '#ff7777' }}>
                    Failed to load posts: {error.message}
                </p>
            </div>
        );
    }

    const posts = fromDbPosts(data || []);
    return <PostManager initialPosts={posts} />;
}
