'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Download, Loader2 } from 'lucide-react';
import { fetchAllAsFiles, saveFiles } from '@/lib/client/save-to-photos';

/**
 * One tap → Save to Photos. The card's files are fetched in the background as
 * soon as the card scrolls into view, so the tap can open the share sheet
 * instantly (iOS only allows that inside a fresh tap). Desktop downloads.
 */
export default function DownloadMediaButton({ urls, baseName, label, className = '' }: { urls: string[]; baseName: string; label?: string; className?: string }) {
    const ref = useRef<HTMLButtonElement>(null);
    const files = useRef<File[] | null>(null);
    const loading = useRef<Promise<File[]> | null>(null);
    const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
    const key = urls.join('|');

    const prepare = () => {
        if (!loading.current) {
            loading.current = fetchAllAsFiles(urls, baseName).then((f) => (files.current = f));
            loading.current.catch(() => { loading.current = null; });
        }
        return loading.current;
    };

    // Prefetch when the card is (nearly) on screen.
    useEffect(() => {
        files.current = null; loading.current = null;
        const el = ref.current;
        if (!el || !urls.length) return;
        const io = new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) { prepare(); io.disconnect(); }
        }, { rootMargin: '300px' });
        io.observe(el);
        return () => io.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    function flash(next: 'done' | 'error') {
        setState(next);
        setTimeout(() => setState('idle'), next === 'error' ? 3500 : 2000);
    }

    async function onClick(e: React.MouseEvent) {
        e.stopPropagation();
        if (!urls.length || state === 'busy') return;
        try {
            if (files.current) {
                // Ready: share inside this tap.
                if ((await saveFiles(files.current)) === 'saved') flash('done');
                return;
            }
            setState('busy');
            const f = await prepare();
            setState('idle');
            if ((await saveFiles(f)) === 'saved') flash('done');
        } catch (err) {
            console.error('DownloadMediaButton:', err);
            flash('error');
        }
    }

    const title = state === 'error' ? 'Could not save, try again' : `Save to Photos${urls.length > 1 ? ` (${urls.length} files)` : ''}`;
    return (
        <button ref={ref} type="button" className={`ak-dlbtn ak-dlbtn--${state} ${className}`} onClick={onClick} disabled={!urls.length || state === 'busy'} title={title} aria-label={title}>
            {state === 'busy' ? <Loader2 size={14} className="ak-spin" /> : state === 'done' ? <Check size={14} /> : state === 'error' ? <AlertTriangle size={14} /> : <Download size={14} />}
            {label && <span>{state === 'done' ? 'Saved' : label}</span>}
        </button>
    );
}
