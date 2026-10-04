// Client helpers for saving post media to the device's photo gallery.
//
// iOS rules that shape this:
//  - navigator.share() only works inside a fresh tap, so files must be fetched
//    BEFORE the tap; the tap then shares instantly ("Save N Images" → Photos).
//  - Safari blocks cross-origin fetches of our Storage files ("Load failed"),
//    so files come through the same-origin /api/admin/media passthrough.

const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime' };

export const isPhone = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

/** Route our Storage URLs through the same-origin passthrough; leave data:/blob: alone. */
export function sameOrigin(url: string): string {
    return /^https?:\/\//i.test(url) ? `/api/admin/media?url=${encodeURIComponent(url)}` : url;
}

export async function fetchAsFile(url: string, name: string): Promise<File> {
    const res = await fetch(sameOrigin(url));
    if (!res.ok) throw new Error(`Could not load the file (HTTP ${res.status})`);
    const blob = await res.blob();
    const urlExt = (url.split('?')[0].split('.').pop() || '').toLowerCase();
    const type = blob.type && blob.type !== 'application/octet-stream' ? blob.type : MIME[urlExt] || 'image/jpeg';
    const ext = type.split('/')[1].replace('jpeg', 'jpg').replace('quicktime', 'mov');
    return new File([blob], `${name}.${ext}`, { type });
}

/** Fetch every URL as a File, numbered when there is more than one. */
export function fetchAllAsFiles(urls: string[], baseName: string): Promise<File[]> {
    return Promise.all(urls.map((u, i) => fetchAsFile(u, urls.length > 1 ? `${baseName}-${String(i + 1).padStart(2, '0')}` : baseName)));
}

/**
 * Save already-fetched files. Call this directly from the click handler with
 * no await before it. Phones: share sheet (Save to Photos). Desktop: downloads.
 * Resolves 'cancelled' if the user closes the sheet.
 */
export async function saveFiles(files: File[]): Promise<'saved' | 'cancelled'> {
    if (isPhone() && navigator.canShare?.({ files })) {
        try {
            await navigator.share({ files });
            return 'saved';
        } catch (e: any) {
            if (e?.name === 'AbortError') return 'cancelled';
            throw e;
        }
    }
    files.forEach((f, i) => setTimeout(() => {
        const href = URL.createObjectURL(f);
        const a = Object.assign(document.createElement('a'), { href, download: f.name });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(href), 10_000);
    }, i * 400));
    return 'saved';
}
