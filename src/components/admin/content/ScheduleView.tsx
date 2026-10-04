'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { CalendarDays, Film, GalleryHorizontal, Star } from 'lucide-react';
// Type-only: src/lib/schedule pulls in the service-role Supabase client, which
// must never be bundled into this client component.
import type { ScheduleRow } from '@/lib/schedule';
import { KindIcon, PLATFORM_LABEL, isOptimizable, kindLabel } from './scheduleUi';
import ScheduleSlotButton from './ScheduleSlotButton';
import SchedulePreview from './SchedulePreview';
import DownloadMediaButton from './DownloadMediaButton';

/*
 * Content > Schedule: a day-by-day agenda. Every ET calendar day between the
 * first and last scheduled post gets a section (empty days render as a slim
 * dashed row so gaps in the plan are obvious). Each post is a card with its
 * real cover; tapping the cover or text opens SchedulePreview, a swipeable
 * read-only viewer. The time chip keeps the existing reschedule picker.
 */

type Filter = 'all' | 'carousel' | 'other';

/** ET calendar day (YYYY-MM-DD). Same as etDayKey in src/lib/schedule. */
const etDayKey = (t: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));

// Day keys are ET calendar dates. Noon UTC of that date formats back to the
// same calendar day in UTC, so labels never drift across a DST boundary.
const keyToDate = (key: string) => new Date(`${key}T12:00:00Z`);
const addDays = (key: string, n: number) => {
    const d = keyToDate(key);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
export const fmtDayKey = (key: string, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...o }).format(keyToDate(key));

export default function ScheduleView({ rows }: { rows: ScheduleRow[] }) {
    const [filter, setFilter] = useState<Filter>('all');
    const [openId, setOpenId] = useState<string | null>(null);
    // Past days start collapsed so today leads the page; tap to expand.
    const [pastOpen, setPastOpen] = useState(false);

    // Frozen at mount; the page is force-dynamic, so a reload picks up a new day.
    const [todayKey] = useState(() => etDayKey(Date.now()));
    const tomorrowKey = addDays(todayKey, 1);

    const carousels = rows.filter((r) => r.kind === 'carousel');
    const others = rows.filter((r) => r.kind !== 'carousel');
    const shown = filter === 'all' ? rows : filter === 'carousel' ? carousels : others;

    const days = useMemo(() => {
        const byDay = new Map<string, ScheduleRow[]>();
        for (const r of shown) {
            const list = byDay.get(r.dayKey) ?? [];
            list.push(r);
            byDay.set(r.dayKey, list);
        }
        const keys = [...byDay.keys()].sort();
        const first = keys[0] && keys[0] < todayKey ? keys[0] : todayKey;
        const last = keys.length && keys[keys.length - 1] > todayKey ? keys[keys.length - 1] : todayKey;
        const out: { key: string; items: ScheduleRow[] }[] = [];
        for (let k = first; k <= last && out.length < 60; k = addDays(k, 1)) {
            out.push({ key: k, items: byDay.get(k) ?? [] });
        }
        return out;
    }, [shown, todayKey]);

    const next = rows.find((r) => r.isFuture);
    const futureCarousels = carousels.filter((r) => r.isFuture);
    const lastCarousel = futureCarousels.at(-1);
    const open = openId ? rows.find((r) => r.id === openId) ?? null : null;

    return (
        <div className="ak-sched">
            <div className="ak-sched__head">
                <div className="ak-sched__facts">
                    <div className="ak-sched__fact">
                        <span className="ak-sched__factlbl">Next up</span>
                        <strong>{next ? `${next.dayLabel}, ${next.slotLabel}` : 'Nothing queued'}</strong>
                    </div>
                    <div className="ak-sched__fact">
                        <span className="ak-sched__factlbl">Carousels</span>
                        <strong>
                            {lastCarousel
                                ? `${futureCarousels.length} through ${fmtDayKey(lastCarousel.dayKey, { month: 'short', day: 'numeric' })}`
                                : 'None yet'}
                        </strong>
                    </div>
                </div>
                <div className="ak-seg" role="group" aria-label="Filter posts">
                    {([
                        ['all', 'All', rows.length],
                        ['carousel', 'Carousels', carousels.length],
                        ['other', 'Other', others.length],
                    ] as const).map(([k, label, n]) => (
                        <button key={k} type="button" aria-pressed={filter === k}
                            className={`ak-seg__btn ${filter === k ? 'ak-seg__btn--on' : ''}`}
                            onClick={() => setFilter(k)}>
                            {label} <span className="ak-seg__count">{n}</span>
                        </button>
                    ))}
                </div>
            </div>
            <p className="ak-sched__tz"><CalendarDays size={13} /> All times Eastern (ET). Tap a post to preview it.</p>

            <div className="ak-sched__days">
                {days.map(({ key, items }) => {
                    const isToday = key === todayKey;
                    const isPast = key < todayKey;
                    const rel = isToday ? 'Today' : key === tomorrowKey ? 'Tomorrow' : null;
                    const cls = ['ak-day', isToday && 'ak-day--today', isPast && 'ak-day--past', !items.length && 'ak-day--empty']
                        .filter(Boolean).join(' ');
                    return (
                        <section key={key} className={cls} aria-label={fmtDayKey(key, { weekday: 'long', month: 'long', day: 'numeric' })}>
                            <header className="ak-day__head">
                                <span className="ak-day__name">
                                    {fmtDayKey(key, { weekday: 'short' })}, {fmtDayKey(key, { month: 'short', day: 'numeric' })}
                                </span>
                                {rel && <span className="ak-day__rel">{rel}</span>}
                                {items.length === 0 && (
                                    <span className="ak-day__none">{filter === 'carousel' ? 'No carousel planned' : 'Nothing scheduled'}</span>
                                )}
                                {items.length > 0 && !isPast && (
                                    <span className="ak-day__count">{items.length} {items.length === 1 ? 'post' : 'posts'}</span>
                                )}
                                {items.length > 0 && isPast && (
                                    <button type="button" className="ak-day__toggle" aria-expanded={pastOpen} onClick={() => setPastOpen((v) => !v)}>
                                        {items.length} posted · {pastOpen ? 'Hide' : 'Show'}
                                    </button>
                                )}
                            </header>
                            {items.length > 0 && (!isPast || pastOpen) && (
                                <div className="ak-day__grid">
                                    {items.map((r, i) => (
                                        <ScheduleCard key={r.id} row={r} priority={isToday && i === 0} onOpen={() => setOpenId(r.id)} />
                                    ))}
                                </div>
                            )}
                        </section>
                    );
                })}
            </div>

            {open && <SchedulePreview row={open} onClose={() => setOpenId(null)} />}
        </div>
    );
}

/** What a post actually publishes: the reel MP4, every carousel slide, or the single image. */
function mediaUrls(r: ScheduleRow): string[] {
    if (r.videoUrl) return [r.videoUrl];
    if (r.slides.length) return r.slides;
    return r.cover ? [r.cover] : [];
}

function ScheduleCard({ row: r, onOpen, priority }: { row: ScheduleRow; onOpen: () => void; priority?: boolean }) {
    return (
        <article className={`ak-scard ${r.isFuture ? '' : 'ak-scard--done'}`}>
            <button type="button" className="ak-scard__thumb" onClick={onOpen} aria-label={`Preview ${r.title}`}>
                {r.cover ? (
                    <Image
                        src={r.cover}
                        alt=""
                        fill
                        sizes="(max-width: 560px) 96px, 116px"
                        unoptimized={!isOptimizable(r.cover)}
                        priority={priority}
                        draggable={false}
                    />
                ) : (
                    <span className="ak-scard__noimg"><KindIcon kind={r.kind} size={20} /></span>
                )}
                {r.kind === 'carousel' && <span className="ak-scard__badge"><GalleryHorizontal size={11} />{r.slides.length}</span>}
                {r.kind === 'video' && <span className="ak-scard__badge"><Film size={11} /></span>}
            </button>
            <div className="ak-scard__body">
                <div className="ak-scard__meta">
                    <ScheduleSlotButton
                        id={r.id}
                        title={r.title}
                        iso={r.scheduledPostTime}
                        slotLabel={r.slotLabel}
                        editable={r.isFuture && r.status === 'approved'}
                    />
                    {r.isPeak && <span className="ak-scard__peak" title="Peak slot" aria-label="Peak slot"><Star size={10} /></span>}
                    <span className={`ak-scard__kind ak-scard__kind--${r.kind}`}>{kindLabel(r)}</span>
                    {r.status === 'published' && <span className="ak-scard__posted">Posted</span>}
                    <DownloadMediaButton urls={mediaUrls(r)} baseName={r.slug || 'kumolab-post'} />
                </div>
                <button type="button" className="ak-scard__open" onClick={onOpen}>
                    <span className="ak-scard__title">{r.title}</span>
                    {r.caption && <span className="ak-scard__cap">{r.caption}</span>}
                </button>
                <div className="ak-scard__plats" aria-label="Posts to">
                    {r.platforms.map((p) => <span key={p} className={`ak-plat ak-plat--${p}`}>{PLATFORM_LABEL[p]}</span>)}
                </div>
            </div>
        </article>
    );
}
