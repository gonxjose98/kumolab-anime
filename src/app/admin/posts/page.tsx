import PostsList from '@/components/admin/posts/PostsList';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function PostsPage() {
    const { data, error } = await supabaseAdmin
        .from('posts')
        .select('id, title, slug, status, claim_type, source, image, youtube_video_id, timestamp, published_at, scheduled_post_time')
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

    return <PostsList initialPosts={data || []} />;
}
