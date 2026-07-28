/**
 * Archiving a Studio import into a media-library folder.
 *
 * Deliberately decoupled from the edit: the timeline plays the local OPFS copy
 * throughout, and this runs in the background afterwards. A failed upload
 * therefore costs the operator nothing except a retry button — it can never
 * interrupt or corrupt the edit in progress.
 *
 * Flow per file (the same one MediaFolders uses for direct uploads):
 *   POST /api/admin/upload-sign  (destination: 'library')
 *     → signed PUT straight to Supabase Storage
 *       → POST /api/admin/studio/media  (register the bookkeeping row)
 */

/** Kinds the media library can store. Audio is excluded — see canArchive. */
export type LibraryKind = 'image' | 'video';

/**
 * Whether an imported asset can be filed into a folder.
 *
 * Audio cannot: upload-sign accepts only video|image, the studio/media POST
 * rejects other kinds, and studio_media's CHECK constraint bars 'audio'. Audio
 * still imports into the project normally; it is simply never offered for
 * archiving.
 */
export function canArchive(kind: string): kind is LibraryKind {
    return kind === 'image' || kind === 'video';
}

async function postJson(path: string, body: unknown) {
    const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
        throw new Error(json.error || `Request failed (HTTP ${res.status})`);
    }
    return json;
}

/**
 * Upload one file into a folder. Returns the public URL of the stored object.
 * Throws on failure so the caller can surface a retry.
 */
export async function archiveToLibrary(
    file: File,
    kind: LibraryKind,
    folderId: string,
): Promise<string> {
    const signed = await postJson('/api/admin/upload-sign', {
        mediaType: kind,
        filename: file.name,
        destination: 'library',
    });

    const put = await fetch(signed.signedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
    if (!put.ok) {
        throw new Error(`Upload failed (HTTP ${put.status})`);
    }

    await postJson('/api/admin/studio/media', {
        folderId,
        url: signed.publicUrl,
        kind,
        filename: file.name,
        mime: file.type || null,
    });

    return signed.publicUrl as string;
}
