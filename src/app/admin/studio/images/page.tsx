import { supabaseAdmin } from '@/lib/supabase/admin';
import ImageHub, { type ImageRow } from '@/components/admin/studio/ImageHub';

export const dynamic = 'force-dynamic';

/**
 * Studio > Images — image posts (an image, no staged video) in one place,
 * openable in the post editor's image flow (card art, overlays, caption).
 */
export default async function StudioImagesPage() {
    const { data, error } = await supabaseAdmin
        .from('posts')
        .select('id, title, status, image, timestamp, published_at, social_ids, image_settings')
        .not('image', 'is', null)
        .is('social_ids->>staged_video_url', null)
        .order('timestamp', { ascending: false })
        .limit(150);

    const rows: ImageRow[] = (data || [])
        .filter((p: any) => p.image && !String(p.image).includes('placeholder'))
        .map((p: any) => ({
            id: p.id,
            title: p.title,
            status: p.status,
            image: p.image,
            timestamp: p.published_at || p.timestamp,
            edited: !!p.image_settings && Object.keys(p.image_settings).length > 0,
        }));

    if (error) {
        return (
            <div className="ak-empty">
                <p className="ak-body-sm" style={{ color: 'var(--sun)' }}>Failed to load images: {error.message}</p>
            </div>
        );
    }

    return <ImageHub rows={rows} />;
}
