'use client';

import { useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import type { RadarRow } from '@/lib/discover/queries';
import { radarTitle, radarDate, radarFacts } from './format';

type Filter = 'big' | 'all' | 'airing';

const FILTERS: { key: Filter; label: string }[] = [
    { key: 'big', label: 'Big ones' },
    { key: 'all', label: 'All upcoming' },
    { key: 'airing', label: 'Airing now' },
];

/**
 * Release Radar: one calm, date-sorted list. Each row is thumb + title + one
 * facts line + date; everything else (all chips, studio, streaming links,
 * prequel) lives behind the expand.
 */
export default function RadarList({ upcoming, airing, bigThreshold, updatedAt }: {
    upcoming: RadarRow[];
    airing: RadarRow[];
    bigThreshold: number;
    updatedAt: string | null;
}) {
    const [filter, setFilter] = useState<Filter>('big');
    const rows = filter === 'airing' ? airing
        : filter === 'big' ? upcoming.filter((r) => (r.popularity || 0) >= bigThreshold)
        : upcoming;

    return (
        <div className="flex flex-col gap-3 min-w-0">
            <div className="ak-disc__bar">
                <div className="ak-pills">
                    {FILTERS.map((f) => (
                        <button key={f.key} className={`ak-pill ${filter === f.key ? 'ak-pill--active' : ''}`} onClick={() => setFilter(f.key)}>
                            {f.label}
                        </button>
                    ))}
                </div>
                <span className="ak-caption">
                    {filter === 'big' ? `${bigThreshold.toLocaleString('en-US')}+ AniList members` : `${rows.length} shows`}
                </span>
            </div>

            <div className="ak-card ak-card--flush">
                {rows.length === 0 ? (
                    <div className="ak-caption" style={{ padding: '28px 16px', textAlign: 'center' }}>Nothing in this window yet.</div>
                ) : (
                    <ul>{rows.map((r) => <RadarItem key={r.anilist_id} r={r} />)}</ul>
                )}
            </div>
            {updatedAt && (
                <span className="ak-caption" style={{ textAlign: 'center' }}>
                    Source: AniList · updated {new Date(updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET
                </span>
            )}
        </div>
    );
}

export function RadarItem({ r, compact = false }: { r: RadarRow; compact?: boolean }) {
    const [open, setOpen] = useState(false);
    const { day, rel } = radarDate(r);
    const facts = radarFacts(r, compact ? 1 : 2);

    return (
        <li className={`ak-disc__row ${open ? 'ak-disc__row--open' : ''}`}>
            <button className="ak-disc__rowmain" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                {r.cover_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="ak-disc__thumb" src={r.cover_image} alt="" loading="lazy" />
                ) : <span className="ak-disc__thumb" />}
                <span className="ak-disc__text">
                    <span className="ak-disc__title">
                        {radarTitle(r)}
                        {r.season_label && !radarTitle(r).toLowerCase().includes(r.season_label.toLowerCase()) && (
                            <span className="ak-disc__tag">{r.season_label}</span>
                        )}
                    </span>
                    {facts && <span className="ak-disc__facts">{facts}</span>}
                </span>
                <span className="ak-disc__date">
                    <span className="ak-disc__day">{day}</span>
                    {rel && <span className="ak-disc__rel">{r.next_episode && r.next_episode > 1 ? `Ep ${r.next_episode} · ${rel}` : rel}</span>}
                </span>
                <ChevronDown size={16} className="ak-disc__chev" />
            </button>

            {open && (
                <div className="ak-disc__detail">
                    {r.chips?.length > 0 && (
                        <ul className="ak-disc__chips">
                            {r.chips.map((c) => <li key={c} className="ak-disc__chip">{c}</li>)}
                        </ul>
                    )}
                    <dl className="ak-disc__dl">
                        {r.studios?.length > 0 && <><dt>Studio</dt><dd>{r.studios.join(', ')}</dd></>}
                        <dt>Format</dt>
                        <dd>{[r.format?.replace('_', ' '), r.episodes ? `${r.episodes} episodes` : null].filter(Boolean).join(' · ') || 'TBA'}</dd>
                        {r.genres?.length > 0 && <><dt>Genres</dt><dd>{r.genres.slice(0, 4).join(', ')}</dd></>}
                        {r.average_score != null && <><dt>Score</dt><dd>{r.average_score}% on AniList</dd></>}
                        {r.prequel_title && (
                            <>
                                <dt>Prequel</dt>
                                <dd>
                                    {r.prequel_site_url ? <a href={r.prequel_site_url} target="_blank" rel="noreferrer">{r.prequel_title}</a> : r.prequel_title}
                                    {r.prequel_end_date && `, ended ${r.prequel_end_date.slice(0, 4)}`}
                                </dd>
                            </>
                        )}
                    </dl>
                    <div className="ak-disc__links">
                        {r.site_url && (
                            <a href={r.site_url} target="_blank" rel="noreferrer" className="ak-disc__link">AniList <ExternalLink size={12} /></a>
                        )}
                        {(r.streaming || []).map((s) => (
                            <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="ak-disc__link">{s.name} <ExternalLink size={12} /></a>
                        ))}
                    </div>
                </div>
            )}
        </li>
    );
}
