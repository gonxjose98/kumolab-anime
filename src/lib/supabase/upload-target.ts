/**
 * Where a signed upload lands.
 *
 * Lives outside the route module on purpose: an App Router `route.ts` may only
 * export the recognised handler/config names, so a helper exported from there
 * breaks the production build during page-data collection.
 *
 *   'post' (default) → blog-videos / blog-images. Transient post footage; the
 *                      cleanup worker slims blog-videos on a schedule.
 *   'library'        → studio-library. Curated media the operator filed into a
 *                      folder, in a separate bucket precisely so that sweep can
 *                      never reach it.
 *
 * An unrecognised value falls back to the post buckets: the failure direction
 * must be "swept like normal footage", never "silently permanent".
 */
export function resolveUploadTarget(
    destination: unknown,
    mediaType: 'video' | 'image',
): { bucket: string; prefix: string } {
    if (destination === 'library') {
        return { bucket: 'studio-library', prefix: 'library' };
    }
    return {
        bucket: mediaType === 'video' ? 'blog-videos' : 'blog-images',
        prefix: 'manual-uploads',
    };
}
