'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { WireRow } from '@/lib/discover/queries';
import { timeAgo, domainOf, KIND_LABEL } from './format';

const FILTERS = [
    { key: '', label: 'All' },
    { key: 'news', label: 'News' },
    { key: 'streaming', label: 'Streaming' },
    { key: 'release', label: 'Releases' },
    { key: 'youtube', label: 'YouTube' },
    { key: 'trending', label: 'Trending' },
];

const PAGE = 50;

/** Anime Wire: every item the scrapers saw, newest first, one line each. */
export default function WireFeed({ initial }: { initial: WireRow[] }) {
    const [kind, setKind] = useState('');
    const [items, setItems] = useState<WireRow[]>(initial);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(initial.length < PAGE);

    async function load(nextKind: string, offset: number) {
        setBusy(true);
        try {
            const res = await fetch(`/api/admin/wire?kind=${nextKind}&offset=${offset}&limit=${PAGE}`);
            const json = await res.json();
            const got: WireRow[] = json.items || [];
            setItems((prev) => (offset === 0 ? got : [...prev, ...got]));
            setDone(got.length < PAGE);
        } finally {
            setBusy(false);
        }
    }

    function pick(k: string) {
        if (k === kind) return;
        setKind(k);
        load(k, 0);
    }

    return (
        <div className="flex flex-col gap-3 min-w-0">
            <div className="ak-disc__bar">
                <div className={`ak-pills ak-disc__scrollpills ${busy ? 'ak-pills--busy' : ''}`}>
                    {FILTERS.map((f) => (
                        <button key={f.key} className={`ak-pill ${kind === f.key ? 'ak-pill--active' : ''}`} onClick={() => pick(f.key)}>
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="ak-card ak-card--flush">
                {items.length === 0 ? (
                    <div className="ak-caption" style={{ padding: '28px 16px', textAlign: 'center' }}>
                        {busy ? 'Loading...' : 'Nothing here yet. The wire fills every 30 minutes.'}
                    </div>
                ) : (
                    <ul>{items.map((w) => <WireItem key={w.id} w={w} />)}</ul>
                )}
            </div>

            {!done && items.length > 0 && (
                <button className="ak-disc__more" disabled={busy} onClick={() => load(kind, items.length)}>
                    {busy ? 'Loading...' : 'Load more'}
                </button>
            )}
        </div>
    );
}

export function SourceMark({ url, name }: { url: string | null; name: string | null }) {
    const [failed, setFailed] = useState(false);
    const domain = domainOf(url);
    const initial = (name || domain || '?').replace(/^YouTube_/, '').charAt(0).toUpperCase();
    if (!domain || failed) return <span className="ak-disc__fav ak-disc__fav--initial">{initial}</span>;
    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="ak-disc__fav" src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" loading="lazy" onError={() => setFailed(true)} />
    );
}

export function WireItem({ w, compact = false }: { w: WireRow; compact?: boolean }) {
    const [open, setOpen] = useState(false);
    const when = timeAgo(w.published_at || w.detected_at);
    const source = (w.source_name || domainOf(w.url) || '').replace(/^YouTube_/, '');

    return (
        <li className={`ak-disc__row ${open ? 'ak-disc__row--open' : ''}`}>
            <div className="ak-disc__rowmain ak-disc__rowmain--wire">
                <SourceMark url={w.url} name={w.source_name} />
                <a className="ak-disc__text" href={w.url || '#'} target="_blank" rel="noreferrer">
                    <span className="ak-disc__headline">{w.title}</span>
                    <span className="ak-disc__facts">
                        {source}{when && ` · ${when}`}
                        {!compact && w.kind !== 'news' && ` · ${KIND_LABEL[w.kind]}`}
                    </span>
                    {w.anime_title && w.kind !== 'trending' && <span className="ak-disc__anime">{w.anime_title}</span>}
                </a>
                {!compact && (w.summary || w.decision || w.posted) && (
                    <button className="ak-disc__expand" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Show summary">
                        <ChevronDown size={16} className="ak-disc__chev" />
                    </button>
                )}
            </div>
            {open && (
                <div className="ak-disc__detail">
                    {w.summary && <p className="ak-disc__summary">{w.summary}</p>}
                    {(w.posted || w.decision) && (
                        <p className="ak-caption">KumoLab pipeline: {w.posted ? 'Posted' : w.decision}</p>
                    )}
                </div>
            )}
        </li>
    );
}
