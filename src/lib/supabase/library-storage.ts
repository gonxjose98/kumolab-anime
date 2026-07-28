import { supabaseAdmin } from './admin';
import { extractBucketFile } from './storage-url';

/**
 * Deleting the OBJECTS behind studio_media rows.
 *
 * Nothing sweeps `studio-library` — that is the whole point of it being a
 * separate bucket from blog-videos — so these delete paths are the only way
 * bytes are ever reclaimed. A row delete that left the object behind would
 * make every removal a permanent orphan.
 *
 * Scoped to studio-library URLs on purpose: a studio_media row may hold a
 * blog-* URL, and those objects belong to the cleanup worker's lifecycle, not
 * to this one.
 */

export const LIBRARY_BUCKET = 'studio-library';

/** Storage keys for the studio-library objects among these URLs. */
export function libraryKeys(urls: (string | null | undefined)[]): string[] {
    const keys = new Set<string>();
    for (const url of urls) {
        const key = extractBucketFile(url, LIBRARY_BUCKET);
        if (key) keys.add(key);
    }
    return [...keys];
}

/**
 * Remove studio-library objects for these URLs. Non-throwing by design: the
 * bookkeeping row is the source of truth, so a storage failure (or an object
 * already gone) must not fail the user's delete. Returns how many were removed.
 * Chunked to match the cleanup worker's remove() batching.
 */
export async function removeLibraryObjects(urls: (string | null | undefined)[]): Promise<number> {
    const keys = libraryKeys(urls);
    if (keys.length === 0) return 0;

    let removed = 0;
    for (let i = 0; i < keys.length; i += 100) {
        try {
            const { data, error } = await supabaseAdmin
                .storage
                .from(LIBRARY_BUCKET)
                .remove(keys.slice(i, i + 100));
            if (error) {
                console.error('[library-storage] remove failed', error.message);
                continue;
            }
            removed += data?.length || 0;
        } catch (e: any) {
            console.error('[library-storage] remove threw', e?.message || e);
        }
    }
    return removed;
}
