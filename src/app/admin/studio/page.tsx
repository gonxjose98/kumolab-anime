import { supabaseAdmin } from '@/lib/supabase/admin';
import VideoHub, { type VideoRow } from '@/components/admin/studio/VideoHub';

export const dynamic = 'force-dynamic';

/**
 * Studio hub — every video post in one place, openable in the editor. Gives the
 * Studio its own home (reachable from the sidebar) and organizes videos by
 * status instead of hiding them among all posts.
 */
export default async function StudioHubPage() {
    const { data, error } = await supabaseAdmin
        .from('posts')
        .select('id, title, status, image, timestamp, published_at, social_ids, image_settings, youtube_video_id')
        .not('social_ids->>staged_video_url', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(300);

    const rows: VideoRow[] = (data || []).map((p: any) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        image: p.image || (p.youtube_video_id ? `https://img.youtube.com/vi/${p.youtube_video_id}/mqdefault.jpg` : null),
        timestamp: p.published_at || p.timestamp,
        edited: !!p.image_settings?.video_project,
    }));

    if (error) {
        return (
            <div className="ak-empty">
                <p className="ak-body-sm" style={{ color: 'var(--sun)' }}>Failed to load videos: {error.message}</p>
            </div>
        );
    }

    return <VideoHub rows={rows} />;
}
