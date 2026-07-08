/**
 * Local media persistence + probing for KumoLab Studio.
 *
 * Imported/uploaded media bytes are cached in IndexedDB (stores Blobs
 * natively, works in every target browser — Chrome/Firefox/Safari) so the
 * editor can seek/scrub without re-downloading, and so a re-opened project can
 * re-hydrate its media. The *manifest* (which mediaId → remoteUrl) lives in the
 * serialized project; these bytes are the local cache of that manifest.
 */

const DB_NAME = 'kumolab-studio';
const STORE = 'media-blobs';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return dbPromise;
}

export async function putBlob(key: string, blob: Blob): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(blob, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getBlob(key: string): Promise<Blob | null> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve((req.result as Blob) ?? null);
        req.onerror = () => reject(req.error);
    });
}

export async function deleteBlob(key: string): Promise<void> {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export interface MediaProbe {
    durationSec: number;
    width: number;
    height: number;
    hasAudio: boolean;
}

/**
 * Probe a media source (blob URL or remote URL) for duration + dimensions.
 * Uses a detached <video> element (works for audio too — audio just has no
 * video track, so width/height stay 0). `hasAudio` is best-effort: browsers
 * don't expose track info uniformly, so we infer from mozHasAudio / webkit
 * audioTracks when available and otherwise assume true for video/audio kinds.
 */
export function probeMedia(url: string, kind: 'video' | 'audio' | 'image'): Promise<MediaProbe> {
    if (kind === 'image') {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ durationSec: 0, width: img.naturalWidth, height: img.naturalHeight, hasAudio: false });
            img.onerror = () => reject(new Error('Failed to probe image'));
            img.src = url;
        });
    }
    return new Promise((resolve, reject) => {
        const el = document.createElement('video');
        el.preload = 'metadata';
        el.muted = true;
        el.crossOrigin = 'anonymous';
        const cleanup = () => { el.removeAttribute('src'); el.load(); };
        el.onloadedmetadata = () => {
            const anyEl = el as any;
            const hasAudio =
                typeof anyEl.mozHasAudio === 'boolean' ? anyEl.mozHasAudio :
                anyEl.audioTracks ? anyEl.audioTracks.length > 0 :
                anyEl.webkitAudioDecodedByteCount != null ? anyEl.webkitAudioDecodedByteCount > 0 :
                true;
            const probe: MediaProbe = {
                durationSec: isFinite(el.duration) ? el.duration : 0,
                width: el.videoWidth,
                height: el.videoHeight,
                hasAudio,
            };
            cleanup();
            resolve(probe);
        };
        el.onerror = () => { cleanup(); reject(new Error('Failed to probe media')); };
        el.src = url;
    });
}
