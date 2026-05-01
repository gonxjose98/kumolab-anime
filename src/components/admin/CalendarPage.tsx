'use client';

import { useState, useEffect, useMemo } from 'react';
import AdminPageHeader from './AdminSubLayout';

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
        <div className="max-w-7xl mx-auto">
            <AdminPageHeader
                title="Calendar"
                subtitle="Scheduled posts, cron jobs, and task deadlines"
                accentColor="#ff3cac"
                icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />

            <div className="flex gap-4 flex-col lg:flex-row">
                {/* Calendar Grid */}
                <div
                    className="flex-1 rounded-xl overflow-hidden"
                    style={{ background: 'rgba(12,12,24,0.5)', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}
                >
                    {/* Month Nav */}
                    <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <button onClick={prevMonth} className="p-1.5 rounded-lg transition-all hover:bg-white/5">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><path d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                            {MONTHS[month]} {year}
                        </span>
                        <button onClick={nextMonth} className="p-1.5 rounded-lg transition-all hover:bg-white/5">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><path d="M9 5l7 7-7 7" /></svg>
                        </button>
                    </div>

                    {/* Day Headers */}
                    <div className="grid grid-cols-7 px-3 pt-3">
                        {DAYS.map(d => (
                            <div key={d} className="text-center text-[9px] font-bold uppercase tracking-wider pb-2" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
                                {d}
                            </div>
                        ))}
                    </div>

                    {/* Calendar Cells */}
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#ff3cac', borderTopColor: 'transparent' }} />
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
                                        className="p-1.5 min-h-[72px] rounded-lg text-left transition-all relative group"
                                        style={{
                                            background: isSelected ? 'rgba(255,60,172,0.08)' : isTodayCell ? 'rgba(0,212,255,0.05)' : 'transparent',
                                            border: isSelected ? '1px solid rgba(255,60,172,0.2)' : isTodayCell ? '1px solid rgba(0,212,255,0.15)' : '1px solid transparent',
                                        }}
                                    >
                                        <span
                                            className="text-[11px] font-medium"
                                            style={{
                                                color: isTodayCell ? '#00d4ff' : 'var(--text-secondary)',
                                                fontFamily: 'var(--font-display)',
                                                fontWeight: isTodayCell ? 700 : 500,
                                            }}
                                        >
                                            {day}
                                        </span>
                                        {/* Event dots */}
                                        {dayEvents.length > 0 && (
                                            <div className="flex gap-0.5 mt-1 flex-wrap">
                                                {dayEvents.slice(0, 4).map((evt, j) => (
                                                    <div
                                                        key={j}
                                                        className="w-1.5 h-1.5 rounded-full"
                                                        style={{ background: evt.color }}
                                                        title={evt.title}
                                                    />
                                                ))}
                                                {dayEvents.length > 4 && (
                                                    <span className="text-[7px]" style={{ color: 'var(--text-muted)' }}>+{dayEvents.length - 4}</span>
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
                <div className="w-full lg:w-80 space-y-4">
                    {/* Cron Schedule */}
                    <div
                        className="rounded-xl overflow-hidden"
                        style={{ background: 'rgba(12,12,24,0.5)', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}
                    >
                        <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)', color: '#ffaa00' }}>
                                Daily Cron Schedule (EST)
                            </span>
                        </div>
                        <div className="p-3 space-y-1.5">
                            {CRON_SLOTS.map((slot) => (
                                <div key={slot.time} className="flex items-center gap-3 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
                                    <span className="text-[10px] font-mono w-12" style={{ color: slot.color }}>{slot.time}</span>
                                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{slot.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Selected Day Detail */}
                    {selectedDay && (
                        <div
                            className="rounded-xl overflow-hidden"
                            style={{ background: 'rgba(12,12,24,0.5)', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}
                        >
                            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ fontFamily: 'var(--font-display)', color: '#ff3cac' }}>
                                    {MONTHS[month]} {selectedDay}, {year}
                                </span>
                            </div>
                            <div className="p-3 space-y-1.5">
                                {selectedEvents.length === 0 ? (
                                    <p className="text-[10px] text-center py-4" style={{ color: 'var(--text-muted)' }}>Nothing scheduled</p>
                                ) : selectedEvents.map((evt) => (
                                    <div key={evt.id} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: `${evt.color}08` }}>
                                        <div className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0" style={{ background: evt.color }} />
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{evt.title}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {evt.time && <span className="text-[8px] font-mono" style={{ color: evt.color }}>{evt.time}</span>}
                                                <span className="text-[8px] uppercase" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
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
                    <div
                        className="rounded-xl p-3"
                        style={{ background: 'rgba(12,12,24,0.5)', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}
                    >
                        <span className="text-[9px] font-bold uppercase tracking-wider block mb-2" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-muted)' }}>Legend</span>
                        <div className="space-y-1.5">
                            {[
                                { color: '#00d4ff', label: 'Scheduled Post' },
                                { color: '#ffaa00', label: 'Daily Drop / Cron' },
                                { color: '#ff3cac', label: 'Task Due' },
                                { color: '#7b61ff', label: 'Pending Review' },
                            ].map(item => (
                                <div key={item.label} className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                                    <span className="text-[9px]" style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
