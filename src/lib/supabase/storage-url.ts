/**
 * Supabase public-URL ↔ storage-key helpers.
 *
 * Lifted out of cleanup-worker.ts so the studio delete routes reuse the exact
 * same parsing rather than growing a second, subtly-different copy. The
 * decodeURIComponent variant matters: upload-sign sanitizes the filename base
 * but the timestamp and extension can still percent-encode, and a keep-set or
 * a remove() built from the wrong spelling silently misses the object.
 */

/** Pull the object key out of a Supabase public URL for a given bucket, or null. */
export function extractBucketFile(url: string | null | undefined, bucket: string): string | null {
    if (!url) return null;
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    return url.substring(idx + marker.length);
}

/**
 * Both spellings of an object key (raw and percent-decoded), deduped. Use when
 * building a set to compare against `storage.list()` names.
 */
export function bucketFileVariants(url: string | null | undefined, bucket: string): string[] {
    const raw = extractBucketFile(url, bucket);
    if (!raw) return [];
    const out = [raw];
    try {
        const decoded = decodeURIComponent(raw);
        if (decoded !== raw) out.push(decoded);
    } catch {
        // Malformed escape sequence — the raw spelling is all we have.
    }
    return out;
}
