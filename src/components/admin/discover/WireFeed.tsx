'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { WireRow } from '@/lib/discover/queries';
import Pic from '@/components/admin/home/Pic';
import { KIND_LABEL, KIND_CHIP, wireHeadline, wireImages, shortSource, ageShort, wireDayGroup } from './format';

const FILTERS = [
    { key: '', label: 'All' },
    { key: 'news', label: 'News' },
    { key: 'streaming', label: 'Streaming' },
    { key: 'release', label: 'Releases' },
    { key: 'youtube', label: 'YouTube' },
    { key: 'trending', label: 'Trending' },
];

const PAGE = 50;

/** Anime Wire: every item the scrapers saw, newest first, grouped by day. */
export default function WireFeed({ initial }: { initial: WireRow[] }) {
    const [kind, setKind] = useState('');
    const [everything, setEverything] = useState(false);
    const [items, setItems] = useState<WireRow[]>(initial);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(initial.length < PAGE);

    async function load(nextKind: string, offset: number, all: boolean) {
        setBusy(true);
        try {
            const res = await fetch(`/api/admin/wire?kind=${nextKind}&offset=${offset}&limit=${PAGE}${all ? '&all=1' : ''}`);
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
        load(k, 0, everything);
    }

    function toggleAll() {
        const next = !everything;
        setEverything(next);
        load(kind, 0, next);
    }

    const groups: { label: string; rows: WireRow[] }[] = [];
    for (const w of items) {
        const g = wireDayGroup(w.published_at || w.detected_at);
        const last = groups[groups.length - 1];
        if (last && last.label === g) last.rows.push(w);
        else groups.push({ label: g, rows: [w] });
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
                <button className="ak-home-toggle" onClick={toggleAll} aria-pressed={everything} title="Anime only hides gaming, live-action and other non-anime items">
                    {everything ? 'Showing everything' : 'Anime only'}
                </button>
            </div>

            <div className="ak-card ak-home-card">
                {items.length === 0 ? (
                    <div className="ak-caption" style={{ padding: '20px 0', textAlign: 'center' }}>
                        {busy ? 'Loading...' : 'Nothing here yet. The wire fills every 30 minutes.'}
                    </div>
                ) : (
                    groups.map((g, i) => (
                        <div key={`${g.label}-${i}`}>
                            <div className="ak-home-group">{g.label}</div>
                            <ul>{g.rows.map((w) => <WireItem key={w.id} w={w} />)}</ul>
                        </div>
                    ))
                )}
            </div>

            {!done && items.length > 0 && (
                <button className="ak-disc__more" disabled={busy} onClick={() => load(kind, items.length, everything)}>
                    {busy ? 'Loading...' : 'Load more'}
                </button>
            )}
        </div>
    );
}

/** One wire row: thumbnail, plain headline, colored kind chip, source and age. Tap for the original. */
export function WireItem({ w }: { w: WireRow }) {
    const [open, setOpen] = useState(false);
    const headline = wireHeadline(w);
    const age = ageShort(w.published_at || w.detected_at);
    const source = shortSource(w.source_name, w.url);

    return (
        <li className={`ak-home-row ${open ? 'ak-home-row--open' : ''}`}>
            <button className="ak-home-row__main" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                <Pic srcs={wireImages(w)} label={w.anime_title || headline} className="ak-home-row__thumb" />
                <span className="ak-home-row__text">
                    <span className="ak-home-row__title">{headline}</span>
                    <span className="ak-home-row__meta">
                        <span className={`ak-home-chip ${KIND_CHIP[w.kind] || ''}`}>{KIND_LABEL[w.kind] || 'News'}</span>
                        <span className="ak-home-row__src">{source}{age && ` · ${age}`}</span>
                    </span>
                </span>
                <ChevronDown size={16} className="ak-home-row__chev" aria-hidden="true" />
            </button>
            {open && (
                <div className="ak-home-orig ak-home-orig--row">
                    {w.plain_title && w.plain_title !== w.title && <p><b>Original headline:</b> {w.title}</p>}
                    {w.summary && <p className="ak-home-orig__sum">{w.summary}</p>}
                    {(w.posted || w.decision) && <p className="ak-caption">KumoLab pipeline: {w.posted ? 'Posted' : w.decision}</p>}
                    {w.url && <a href={w.url} target="_blank" rel="noreferrer">Read at {source || 'source'} ›</a>}
                </div>
            )}
        </li>
    );
}
