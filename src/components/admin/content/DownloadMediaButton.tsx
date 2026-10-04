'use client';

import { useState } from 'react';
import { AlertTriangle, Check, Download, Loader2 } from 'lucide-react';

/**
 * Save a post's media to the device.
 *
 * Phones: tap 1 fetches the files, tap 2 opens the native share sheet with
 * every file attached ("Save N Images" / "Save Video" → camera roll). It has
 * to be two taps: iOS only allows navigator.share() inside a fresh tap, and
 * downloading a whole carousel first uses that tap up (the old one-tap
 * version fell back to a single download into Files).
 * Desktop: downloads every file directly.
 */
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime' };
const isPhone = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

export default function DownloadMediaButton({ urls, baseName }: { urls: string[]; baseName: string }) {
    const [state, setState] = useState<'idle' | 'busy' | 'ready' | 'done' | 'error'>('idle');
    const [files, setFiles] = useState<File[]>([]);
    const [msg, setMsg] = useState('');

    async function fetchFiles(): Promise<File[]> {
        return Promise.all(urls.map(async (url, i) => {
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const urlExt = (url.split('?')[0].split('.').pop() || '').toLowerCase();
            const type = blob.type && blob.type !== 'application/octet-stream' ? blob.type : MIME[urlExt] || 'image/jpeg';
            const ext = type.split('/')[1].replace('jpeg', 'jpg').replace('quicktime', 'mov');
            const suffix = urls.length > 1 ? `-${String(i + 1).padStart(2, '0')}` : '';
            return new File([blob], `${baseName}${suffix}.${ext}`, { type });
        }));
    }

    function flash(next: 'done' | 'error', text = '') {
        setState(next); setMsg(text);
        setTimeout(() => { setState('idle'); setMsg(''); setFiles([]); }, next === 'error' ? 4000 : 2200);
    }

    async function onClick(e: React.MouseEvent) {
        e.stopPropagation();
        if (!urls.length || state === 'busy') return;

        // Tap 2 on a phone: share the prepared files inside this fresh tap.
        if (state === 'ready') {
            try {
                await navigator.share({ files });
                flash('done');
            } catch (err: any) {
                if (err?.name === 'AbortError') { setState('ready'); return; }
                console.error('DownloadMediaButton share:', err);
                flash('error', 'Could not open the save sheet');
            }
            return;
        }

        setState('busy');
        try {
            const prepared = await fetchFiles();
            if (isPhone()) {
                if (navigator.canShare?.({ files: prepared })) {
                    setFiles(prepared);
                    setState('ready');
                } else {
                    flash('error', 'This browser cannot save to Photos. Open the CRM in Safari.');
                }
                return;
            }
            for (const f of prepared) {
                const href = URL.createObjectURL(f);
                const a = Object.assign(document.createElement('a'), { href, download: f.name });
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(() => URL.revokeObjectURL(href), 4000);
            }
            flash('done');
        } catch (err) {
            console.error('DownloadMediaButton:', err);
            flash('error', 'Download failed, try again');
        }
    }

    const n = urls.length;
    const title = msg || (state === 'ready' ? `Tap to save ${n > 1 ? `${n} files` : 'to Photos'}` : `Save to device${n > 1 ? ` (${n} files)` : ''}`);
    return (
        <button type="button" className={`ak-dlbtn ak-dlbtn--${state}`} onClick={onClick} disabled={!n || state === 'busy'} title={title} aria-label={title}>
            {state === 'busy' && <Loader2 size={14} className="ak-spin" />}
            {state === 'done' && <Check size={14} />}
            {state === 'error' && <AlertTriangle size={14} />}
            {state === 'idle' && <Download size={14} />}
            {state === 'ready' && <><Download size={13} /><span>Save {n > 1 ? n : ''}</span></>}
        </button>
    );
}
