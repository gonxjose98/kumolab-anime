import { supabaseAdmin } from '@/lib/supabase/admin';
import VideoHub, { type VideoRow } from '@/components/admin/studio/VideoHub';

export const dynamic = 'force-dynamic';

// Studio is your workbench: ONLY work that hasn't posted yet — drafts, pending,
// and scheduled video. Once a post publishes it leaves the Studio and lives in
// the Library (button in the hub), which opens it as a fresh draft copy so the
// live post is never touched. Declined pieces are hidden too.
const HIDDEN_STATUSES = new Set(['published', 'declined']);

/** Studio > Videos — editable video work that hasn't been posted yet. */
export default async function StudioVideosPage() {
    const { data, error } = await supabaseAdmin
        .from('posts')
        .select('id, title, status, image, timestamp, published_at, social_ids, image_settings, youtube_video_id')
        .not('social_ids->>staged_video_url', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(400);

    const rows: VideoRow[] = (data || [])
        .filter((p: any) => !HIDDEN_STATUSES.has(p.status))
        .map((p: any) => ({
            id: p.id,
            title: p.title,
            status: p.status,
            image: p.image || (p.youtube_video_id ? `https://img.youtube.com/vi/${p.youtube_video_id}/mqdefault.jpg` : null),
            timestamp: p.published_at || p.timestamp,
            editedAt: p.image_settings?.studio_edited_at || null,
            edited: !!p.image_settings?.video_project,
            editedBy: p.image_settings?.edited_by || null,
        }))
        .sort((a, b) => new Date(b.editedAt || b.timestamp || 0).getTime() - new Date(a.editedAt || a.timestamp || 0).getTime());

    if (error) {
        return (
            <div className="ak-empty">
                <p className="ak-body-sm" style={{ color: 'var(--sun)' }}>Failed to load videos: {error.message}</p>
            </div>
        );
    }

    return <VideoHub rows={rows} kind="videos" />;
}
