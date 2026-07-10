import Link from 'next/link';
import { Star, Clock } from 'lucide-react';
import type { ScheduleRow } from '@/lib/schedule';
import ScheduleSlotButton from './ScheduleSlotButton';

const CLAIM_LABEL: Record<string, string> = {
    TRAILER_DROP: 'Trailer', NEW_KEY_VISUAL: 'Key Visual', NEW_SEASON_CONFIRMED: 'New Season',
    DATE_ANNOUNCED: 'Release Date', DELAY: 'Delay', CAST_ADDITION: 'Cast', STAFF_UPDATE: 'Staff', OTHER: 'News',
};

const STATUS_LABEL: Record<string, string> = { published: 'Published', approved: 'Scheduled', pending: 'Pending', draft: 'Draft' };

export default function ScheduleView({ rows }: { rows: ScheduleRow[] }) {
    const peakToday = rows.filter((r) => r.dayLabel === 'Today' && r.isPeak).length;
    const totalToday = rows.filter((r) => r.dayLabel === 'Today').length;
    const upcoming = rows.filter((r) => r.isFuture).length;

    // group by day, preserving order
    const groups: { day: string; items: ScheduleRow[] }[] = [];
    for (const r of rows) {
        let g = groups.find((x) => x.day === r.dayLabel);
        if (!g) { g = { day: r.dayLabel, items: [] }; groups.push(g); }
        g.items.push(r);
    }

    return (
        <div className="ak-sched">
            <div className="ak-sched__head">
                <div className="ak-sched__summary">
                    <Stat value={String(totalToday)} label="Slotted today" />
                    <Stat value={String(peakToday)} label="Peak slots today" gold />
                    <Stat value={String(upcoming)} label="Still upcoming" />
                </div>
                <div className="ak-sched__legend">
                    <Star size={12} /> Peak hours: <strong>12pm &amp; 5–10pm ET</strong> (anime-audience prime time)
                </div>
            </div>

            {rows.length === 0 ? (
                <div className="ak-sched__empty">
                    <Clock size={26} strokeWidth={1.5} />
                    <p>Nothing slotted in this window. KumoLab posts hourly, the queue fills through the day and priority pieces are held for peak hours.</p>
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
                                        {r.isPeak
                                            ? <span className="ak-sched__peak"><Star size={11} /> Peak</span>
                                            : <span className="ak-sched__off">Off-peak</span>}
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
