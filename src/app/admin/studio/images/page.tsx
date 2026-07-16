import { supabaseAdmin } from '@/lib/supabase/admin';
import ImageHub, { type ImageRow } from '@/components/admin/studio/ImageHub';

export const dynamic = 'force-dynamic';

// Same workbench rule as videos: drafts + recently edited (last 60 days).
const RECENT_MS = 60 * 86_400_000;

/**
 * Studio > Images — image work in progress (drafts + recently edited),
 * openable in the post editor's image flow (card art, overlays, caption).
 */
export default async function StudioImagesPage() {
    const { data, error } = await supabaseAdmin
        .from('posts')
        .select('id, title, status, image, timestamp, published_at, social_ids, image_settings')
        .not('image', 'is', null)
        .is('social_ids->>staged_video_url', null)
        .order('timestamp', { ascending: false })
        .limit(400);

    const now = Date.now();
    const rows: ImageRow[] = (data || [])
        .filter((p: any) => {
            if (!p.image || String(p.image).includes('placeholder')) return false;
            if (p.status === 'draft') return true;
            const t = p.image_settings?.studio_edited_at;
            return t && now - new Date(t).getTime() < RECENT_MS;
        })
        .map((p: any) => ({
            id: p.id,
            title: p.title,
            status: p.status,
            image: p.image,
            timestamp: p.published_at || p.timestamp,
            editedAt: p.image_settings?.studio_edited_at || null,
            edited: !!p.image_settings?.studio_edited_at,
            editedBy: p.image_settings?.edited_by || null,
        }))
        .sort((a, b) => new Date(b.editedAt || b.timestamp || 0).getTime() - new Date(a.editedAt || a.timestamp || 0).getTime());

    if (error) {
        return (
            <div className="ak-empty">
                <p className="ak-body-sm" style={{ color: 'var(--sun)' }}>Failed to load images: {error.message}</p>
            </div>
        );
    }

    return <ImageHub rows={rows} kind="images" />;
}
