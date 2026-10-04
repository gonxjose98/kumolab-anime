'use client';

import { useState } from 'react';
import { Check, Download, Loader2 } from 'lucide-react';

/**
 * Save a post's media to the device. On phones this opens the native share
 * sheet with the files attached, so iOS/Android offer "Save Image(s)" /
 * "Save Video" straight into the gallery. Desktop (no file sharing) falls
 * back to plain downloads. Carousels save every slide in order.
 */
export default function DownloadMediaButton({ urls, baseName, label = 'Save to device' }: { urls: string[]; baseName: string; label?: string }) {
    const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

    async function save(e: React.MouseEvent) {
        e.stopPropagation();
        if (!urls.length || state === 'busy') return;
        setState('busy');
        try {
            const files = await Promise.all(urls.map(async (url, i) => {
                const res = await fetch(url, { cache: 'no-store' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const blob = await res.blob();
                const ext = (blob.type.split('/')[1] || url.split('?')[0].split('.').pop() || 'bin').replace('jpeg', 'jpg');
                const suffix = urls.length > 1 ? `-${String(i + 1).padStart(2, '0')}` : '';
                return new File([blob], `${baseName}${suffix}.${ext}`, { type: blob.type });
            }));

            if (typeof navigator !== 'undefined' && navigator.canShare?.({ files })) {
                try {
                    await navigator.share({ files });
                } catch (err: any) {
                    if (err?.name === 'AbortError') { setState('idle'); return; } // user closed the sheet
                    throw err;
                }
            } else {
                for (const f of files) {
                    const href = URL.createObjectURL(f);
                    const a = Object.assign(document.createElement('a'), { href, download: f.name });
                    document.body.appendChild(a); a.click(); a.remove();
                    setTimeout(() => URL.revokeObjectURL(href), 4000);
                }
            }
            setState('done');
            setTimeout(() => setState('idle'), 2200);
        } catch (err) {
            console.error('DownloadMediaButton:', err);
            setState('error');
            setTimeout(() => setState('idle'), 2500);
        }
    }

    const title = state === 'error' ? 'Download failed, try again' : `${label}${urls.length > 1 ? ` (${urls.length} files)` : ''}`;
    return (
        <button type="button" className={`ak-dlbtn ak-dlbtn--${state}`} onClick={save} disabled={!urls.length || state === 'busy'} title={title} aria-label={title}>
            {state === 'busy' ? <Loader2 size={14} className="ak-spin" /> : state === 'done' ? <Check size={14} /> : <Download size={14} />}
        </button>
    );
}
