'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, X } from 'lucide-react';
import type { PlatformCaptions } from '@/lib/social/platform-captions';

/*
 * "Captions" popup: exactly what each platform gets for one post (the same
 * helper the publisher uses), with a Copy button per block. TikTok is posted by
 * hand, so its title + caption live here for copy-paste.
 */

type Tab = 'instagram' | 'facebook' | 'threads' | 'x' | 'tiktok';
const TABS: { key: Tab; label: string }[] = [
    { key: 'instagram', label: 'Instagram' },
    { key: 'threads', label: 'Threads' },
    { key: 'facebook', label: 'Facebook' },
    { key: 'x', label: 'X' },
    { key: 'tiktok', label: 'TikTok' },
];

function CopyBlock({ label, text }: { label: string; text: string | null }) {
    const [done, setDone] = useState(false);
    async function copy() {
        if (!text) return;
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1600); } catch { /* clipboard blocked */ }
    }
    return (
        <div className="ak-caps__block">
            <div className="ak-caps__blockhead">
                <span>{label}</span>
                {text && (
                    <button type="button" className="ak-caps__copy" onClick={copy}>
                        {done ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
                    </button>
                )}
            </div>
            {text ? <p className="ak-caps__text">{text}</p> : <p className="ak-caps__text is-none">Not written yet. Ask Claude to add it.</p>}
        </div>
    );
}

export default function CaptionsSheet({ title, captions, onClose }: { title: string; captions: PlatformCaptions; onClose: () => void }) {
    const [tab, setTab] = useState<Tab>('instagram');
    useEffect(() => {
        const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
        window.addEventListener('keydown', key, true);
        return () => window.removeEventListener('keydown', key, true);
    }, [onClose]);
    if (typeof document === 'undefined') return null;
    return createPortal(
        <div className="admin-root">
            <div className="ak-modal__scrim ak-caps__scrim" onClick={onClose}>
                <div className="ak-modal ak-caps" role="dialog" aria-modal="true" aria-label={`Captions: ${title}`} onClick={(e) => e.stopPropagation()}>
                    <div className="ak-modal__head">
                        <span className="ak-title ak-caps__title">{title}</span>
                        <button type="button" className="ak-btn ak-btn--ghost ak-btn--sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
                    </div>
                    <div className="ak-caps__tabs" role="tablist">
                        {TABS.map((t) => (
                            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`ak-caps__tab${tab === t.key ? ' is-on' : ''}`} onClick={() => setTab(t.key)}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                    <div className="ak-modal__body ak-caps__body">
                        {tab === 'instagram' && <CopyBlock label="Caption" text={captions.instagram} />}
                        {tab === 'facebook' && <CopyBlock label="Caption" text={captions.facebook} />}
                        {tab === 'x' && <CopyBlock label="Post text" text={captions.x} />}
                        {tab === 'threads' && (
                            <>
                                <CopyBlock label="Post" text={captions.threads} />
                                {captions.threadsReply && <CopyBlock label="First reply" text={captions.threadsReply} />}
                            </>
                        )}
                        {tab === 'tiktok' && (
                            <>
                                <CopyBlock label="Title" text={captions.tiktokTitle} />
                                <CopyBlock label="Caption" text={captions.tiktok} />
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}
