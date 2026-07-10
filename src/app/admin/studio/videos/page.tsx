import { supabaseAdmin } from '@/lib/supabase/admin';
import VideoHub, { type VideoRow } from '@/components/admin/studio/VideoHub';

export const dynamic = 'force-dynamic';

// Studio is your workbench: drafts + anything edited recently (last 60 days),
// even if it later got scheduled or published. Everything else lives in the
// Library (button in the hub). Mirrors the Images page filter.
const RECENT_MS = 60 * 86_400_000;

/** Studio > Videos — video work in progress (drafts + recently edited). */
export default async function StudioVideosPage() {
    const { data, error } = await supabaseAdmin
        .from('posts')
        .select('id, title, status, image, timestamp, published_at, social_ids, image_settings, youtube_video_id')
        .not('social_ids->>staged_video_url', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(400);

    const now = Date.now();
    const rows: VideoRow[] = (data || [])
        .filter((p: any) => {
            if (p.status === 'draft') return true;
            const t = p.image_settings?.studio_edited_at;
            return t && now - new Date(t).getTime() < RECENT_MS;
        })
        .map((p: any) => ({
            id: p.id,
            title: p.title,
            status: p.status,
            image: p.image || (p.youtube_video_id ? `https://img.youtube.com/vi/${p.youtube_video_id}/mqdefault.jpg` : null),
            timestamp: p.published_at || p.timestamp,
            editedAt: p.image_settings?.studio_edited_at || null,
            edited: !!p.image_settings?.video_project,
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
