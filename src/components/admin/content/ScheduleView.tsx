'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Star, Clock } from 'lucide-react';
import type { ScheduleRow } from '@/lib/schedule';
import ScheduleSlotButton from './ScheduleSlotButton';

const CLAIM_LABEL: Record<string, string> = {
    TRAILER_DROP: 'Trailer', NEW_KEY_VISUAL: 'Key Visual', NEW_SEASON_CONFIRMED: 'New Season',
    DATE_ANNOUNCED: 'Release Date', DELAY: 'Delay', CAST_ADDITION: 'Cast', STAFF_UPDATE: 'Staff', OTHER: 'News',
};

const STATUS_LABEL: Record<string, string> = { published: 'Published', approved: 'Scheduled', pending: 'Pending', draft: 'Draft' };

// Facebook-only key visuals (image posts) are scheduled to their own off-peak
// grid and never touch the IG peak reels. IG is the main engine, so the view
// defaults to it and Facebook sits behind a toggle to keep the IG schedule clean.
const isFacebookOnly = (r: ScheduleRow) => (r.claim || '').toUpperCase() === 'NEW_KEY_VISUAL';

type Platform = 'ig' | 'fb';

export default function ScheduleView({ rows }: { rows: ScheduleRow[] }) {
    const [platform, setPlatform] = useState<Platform>('ig');

    const igRows = rows.filter((r) => !isFacebookOnly(r));
    const fbRows = rows.filter(isFacebookOnly);
    const shown = platform === 'ig' ? igRows : fbRows;

    const peakToday = shown.filter((r) => r.dayLabel === 'Today' && r.isPeak).length;
    const totalToday = shown.filter((r) => r.dayLabel === 'Today').length;
    const upcoming = shown.filter((r) => r.isFuture).length;

    // group by day, preserving order
    const groups: { day: string; items: ScheduleRow[] }[] = [];
    for (const r of shown) {
        let g = groups.find((x) => x.day === r.dayLabel);
        if (!g) { g = { day: r.dayLabel, items: [] }; groups.push(g); }
        g.items.push(r);
    }

    return (
        <div className="ak-sched">
            <div className="ak-sched__head">
                <div className="ak-seg" role="group" aria-label="Platform schedule">
                    <button type="button" className={`ak-seg__btn ${platform === 'ig' ? 'ak-seg__btn--on' : ''}`}
                        aria-pressed={platform === 'ig'} onClick={() => setPlatform('ig')}>
                        Instagram <span className="ak-seg__count">{igRows.length}</span>
                    </button>
                    <button type="button" className={`ak-seg__btn ${platform === 'fb' ? 'ak-seg__btn--on' : ''}`}
                        aria-pressed={platform === 'fb'} onClick={() => setPlatform('fb')}>
                        Facebook <span className="ak-seg__count">{fbRows.length}</span>
                    </button>
                </div>
                <div className="ak-sched__summary">
                    <Stat value={String(totalToday)} label="Slotted today" />
                    <Stat value={String(peakToday)} label="Peak slots today" gold />
                    <Stat value={String(upcoming)} label="Still upcoming" />
                </div>
                <div className="ak-sched__legend">
                    {platform === 'ig'
                        ? <><Star size={12} /> Peak slots: <strong>7:30 AM · 1:00 PM · 9:30 PM ET</strong></>
                        : <><Clock size={12} /> Facebook-only key visuals, posted off-peak (never the IG reels slots)</>}
                </div>
            </div>

            {shown.length === 0 ? (
                <div className="ak-sched__empty">
                    <Clock size={26} strokeWidth={1.5} />
                    <p>{platform === 'ig'
                        ? 'Nothing slotted for Instagram in this window. The queue fills toward the 3 daily peak slots.'
                        : 'No Facebook key visuals slotted in this window.'}</p>
                </div>
            ) : (
                <div className="ak-sched__groups">
                    {groups.map((g) => (
                        <div key={g.day} className="ak-sched__group">
                            <div className="ak-sched__day">{g.day}</div>
                            <div className="ak-sched__rows">
                                {g.items.map((r) => (
                                    <div key={r.id} className={`ak-sched__row ${r.isPeak ? 'ak-sched__row--peak' : ''} ${r.isFuture ? '' : 'ak-sched__row--done'}`}>
                                        <ScheduleSlotButton
                                            id={r.id}
                                            title={r.title}
                                            iso={r.scheduledPostTime}
                                            slotLabel={r.slotLabel}
                                            editable={r.isFuture && r.status === 'approved'}
                                        />
                                        {platform === 'ig' && (r.isPeak
                                            ? <span className="ak-sched__peak"><Star size={11} /> Peak</span>
                                            : <span className="ak-sched__off">Off-peak</span>)}
                                        <Link href={`/admin/post/${r.id}`} className="ak-sched__title">{r.title}</Link>
                                        <span className="ak-sched__claim">{r.claim ? (CLAIM_LABEL[r.claim] || 'News') : ''}</span>
                                        <span className={`ak-sched__status ak-sched__status--${r.status || 'draft'}`}>{r.status ? (STATUS_LABEL[r.status] || r.status) : ''}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function Stat({ value, label, gold }: { value: string; label: string; gold?: boolean }) {
    return (
        <div className={`ak-sched__stat ${gold ? 'ak-sched__stat--gold' : ''}`}>
            <span className="ak-sched__statnum">{value}</span>
            <span className="ak-sched__statlbl">{label}</span>
        </div>
    );
}
