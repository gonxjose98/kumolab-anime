import MediaFolders from '@/components/admin/studio/MediaFolders';

export const dynamic = 'force-dynamic';

/**
 * Studio > Media — the raw-asset library: folders of loose pictures/videos
 * uploaded by the team. These are NOT posts (distinct from the post
 * "Library") and never enter the publish pipeline; later flows pull images
 * from a folder to build carousels. Data loads client-side from
 * /api/admin/studio/folders + /media so the view refreshes in place after
 * every create/upload/delete.
 */
export default function StudioMediaPage() {
    return <MediaFolders />;
}
