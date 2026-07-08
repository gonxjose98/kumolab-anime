'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CalendarEvent {
    id: string;
    title: string;
    type: 'scheduled_post' | 'cron_job' | 'task_due' | 'daily_drop';
    date: string;
    time?: string;
    status?: string;
    color: string;
}

const CRON_SLOTS = [
    { time: '06:00', label: 'Daily Drops', color: '#ffaa00' },
    { time: '08:00', label: 'Morning Slot', color: '#00d4ff' },
    { time: '12:00', label: 'Midday Slot', color: '#00d4ff' },
    { time: '16:00', label: 'Afternoon Slot', color: '#00d4ff' },
    { time: '20:00', label: 'Evening Slot', color: '#00d4ff' },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function CalendarPageClient() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDay, setSelectedDay] = useState<number | null>(null);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    useEffect(() => {
        async function fetchEvents() {
            try {
                const res = await fetch(`/api/admin/calendar-events?year=${year}&month=${month + 1}`);
                if (res.ok) setEvents(await res.json());
            } catch (e) {
                console.error('Failed to fetch calendar events:', e);
            } finally {
                setLoading(false);
            }
        }
        fetchEvents();
    }, [year, month]);

    const calendarGrid = useMemo(() => {
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cells: (number | null)[] = [];

        for (let i = 0; i < firstDay; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
        while (cells.length % 7 !== 0) cells.push(null);

        return cells;
    }, [year, month]);

    const getEventsForDay = (day: number) => {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return events.filter(e => e.date === dateStr);
    };

    const today = new Date();
    const isToday = (day: number) =>
        day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

    const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

    const selectedEvents = selectedDay ? getEventsForDay(selectedDay) : [];

    return (
        <div className="max-w-6xl mx-auto">
            <p className="ak-caption" style={{ marginBottom: '16px' }}>Scheduled posts, cron jobs, and task deadlines</p>

            <div className="flex gap-4 flex-col lg:flex-row">
                {/* Calendar Grid */}
                <div className="flex-1 ak-card ak-card--flush">
                    {/* Month Nav */}
                    <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--line)' }}>
                        <button onClick={prevMonth} className="ak-cal__nav" aria-label="Previous month">
                            <ChevronLeft size={16} />
                        </button>
                        <span className="ak-heading">{MONTHS[month]} {year}</span>
                        <button onClick={nextMonth} className="ak-cal__nav" aria-label="Next month">
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    {/* Day Headers */}
                    <div className="grid grid-cols-7 px-3 pt-3">
                        {DAYS.map(d => (
                            <div key={d} className="text-center ak-overline pb-2">{d}</div>
                        ))}
                    </div>

                    {/* Calendar Cells */}
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--line-2)', borderTopColor: 'var(--blue)' }} />
                        </div>
                    ) : (
                        <div className="grid grid-cols-7 px-3 pb-3 gap-px">
                            {calendarGrid.map((day, i) => {
                                if (day === null) return <div key={`empty-${i}`} className="p-1 min-h-[72px]" />;

                                const dayEvents = getEventsForDay(day);
                                const isSelected = selectedDay === day;
                                const isTodayCell = isToday(day);

                                return (
                                    <button
                                        key={day}
                                        onClick={() => setSelectedDay(isSelected ? null : day)}
                                        className="ak-cal__cell"
                                        style={{
                                            background: isSelected ? 'rgba(196,154,82,0.12)' : isTodayCell ? 'var(--blue-soft)' : 'transparent',
                                            borderColor: isSelected ? 'var(--gold)' : isTodayCell ? '#bcd4f2' : 'transparent',
                                        }}
                                    >
                                        <span
                                            className="text-[12px]"
                                            style={{
                                                color: isTodayCell ? 'var(--blue)' : 'var(--ink-2)',
                                                fontWeight: isTodayCell ? 700 : 500,
                                                fontVariantNumeric: 'tabular-nums',
                                            }}
                                        >
                                            {day}
                                        </span>
                                        {/* Event dots */}
                                        {dayEvents.length > 0 && (
                                            <div className="flex gap-0.5 mt-1 flex-wrap">
                                                {dayEvents.slice(0, 4).map((evt, j) => (
                                                    <div key={j} className="w-1.5 h-1.5 rounded-full" style={{ background: evt.color }} title={evt.title} />
                                                ))}
                                                {dayEvents.length > 4 && (
                                                    <span className="text-[8px]" style={{ color: 'var(--ink-3)' }}>+{dayEvents.length - 4}</span>
                                                )}
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Sidebar: Day Detail + Cron Slots */}
                <div className="w-full lg:w-80 flex flex-col gap-4">
                    {/* Cron Schedule */}
                    <div className="ak-card ak-card--flush">
                        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
                            <span className="ak-overline">Daily Cron Schedule (EST)</span>
                        </div>
                        <div className="p-3 flex flex-col gap-1">
                            {CRON_SLOTS.map((slot) => (
                                <div key={slot.time} className="flex items-center gap-3 px-2 py-1.5 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                                    <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: slot.color }} />
                                    <span className="ak-body-sm" style={{ fontVariantNumeric: 'tabular-nums', width: '44px' }}>{slot.time}</span>
                                    <span className="ak-body-sm">{slot.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Selected Day Detail */}
                    {selectedDay && (
                        <div className="ak-card ak-card--flush">
                            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
                                <span className="ak-overline">{MONTHS[month]} {selectedDay}, {year}</span>
                            </div>
                            <div className="p-3 flex flex-col gap-1.5">
                                {selectedEvents.length === 0 ? (
                                    <p className="ak-caption text-center" style={{ padding: '12px 0' }}>Nothing scheduled</p>
                                ) : selectedEvents.map((evt) => (
                                    <div key={evt.id} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                                        <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: evt.color }} />
                                        <div className="min-w-0">
                                            <p className="ak-body-sm truncate" style={{ fontWeight: 600, color: 'var(--ink)' }}>{evt.title}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {evt.time && <span className="ak-caption" style={{ fontVariantNumeric: 'tabular-nums' }}>{evt.time}</span>}
                                                <span className="ak-caption" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                    {evt.type.replace(/_/g, ' ')}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Legend */}
                    <div className="ak-card">
                        <span className="ak-overline block" style={{ marginBottom: '10px' }}>Legend</span>
                        <div className="flex flex-col gap-1.5">
                            {[
                                { color: '#00d4ff', label: 'Scheduled Post' },
                                { color: '#ffaa00', label: 'Daily Drop / Cron' },
                                { color: '#ff3cac', label: 'Task Due' },
                                { color: '#7b61ff', label: 'Pending Review' },
                            ].map(item => (
                                <div key={item.label} className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                                    <span className="ak-body-sm">{item.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
