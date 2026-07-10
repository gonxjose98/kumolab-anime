import { supabaseAdmin } from '@/lib/supabase/admin';
import LibraryBrowser, { type LibraryItem } from '@/components/admin/studio/LibraryBrowser';

export const dynamic = 'force-dynamic';

/**
 * Studio > Library — everything you've ever saved, as cards. Pull a piece back
 * into the workbench: drafts/pending open directly; scheduled/published open as
 * a fresh draft copy (the live original is never touched).
 */
export default async function StudioLibraryPage() {
    const { data, error } = await supabaseAdmin
        .from('posts')
        .select('id, title, status, image, timestamp, published_at, social_ids, youtube_video_id')
        .order('timestamp', { ascending: false })
        .limit(600);

    const items: LibraryItem[] = (data || [])
        .map((p: any) => {
            const isVideo = !!p.social_ids?.staged_video_url;
            const image = p.image || (p.youtube_video_id ? `https://img.youtube.com/vi/${p.youtube_video_id}/mqdefault.jpg` : null);
            return {
                id: p.id,
                title: p.title,
                status: p.status,
                image: image && !String(image).includes('placeholder') ? image : null,
                kind: (isVideo ? 'video' : 'image') as 'video' | 'image',
                timestamp: p.published_at || p.timestamp,
            };
        })
        // Only content that actually has media to work on.
        .filter((it) => it.image || it.kind === 'video');

    if (error) {
        return (
            <div className="ak-empty">
                <p className="ak-body-sm" style={{ color: 'var(--sun)' }}>Failed to load library: {error.message}</p>
            </div>
        );
    }

    return <LibraryBrowser items={items} />;
}
