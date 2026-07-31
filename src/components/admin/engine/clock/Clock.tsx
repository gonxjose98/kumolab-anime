'use client';

/**
 * The Engine clock — a 24h ET dial over posts.scheduled_post_time.
 *
 * Replaces the PeakSlots card and the read-only ScheduledFeed table with one
 * object: the three gold peak-slot arcs (tap to edit the time, saved through
 * the existing savePeakSlots action), every upcoming approved post as a bead
 * at its true ET angle, and the standby pool below.
 *
 * The one rule the whole drag design rests on: NO DRAG EVER SENDS A POST BACK
 * TO STANDBY. Standby membership is a NULL slot time and the scheduler's
 * pruner can demote a pooled post to 'pending', so a drop onto an occupied
 * slot cascades the occupant to the next open slot server-side instead. The
 * tray is a drag source only.
 *
 * Always dark: the palette lives under `.admin-root .jarvis` (jarvis.css),
 * which this component opts into and never defines.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, X, Check, AlertTriangle, Clock as ClockIcon } from 'lucide-react';
import ScoreBreakdownPopup, { scoreColor } from '@/components/admin/ScoreBreakdownPopup';
import type { PeakSlot, ScheduledItem } from '@/lib/engine/engine-config';
import type { PostScore } from '@/lib/engine/scoring';
import { etDayKey, etMinutesOfDay, etSlotInstant, slotMinutesOfDay } from '@/lib/engine/et-time';
import Dial, { type DialBead, type DialSlot } from './Dial';
import StandbyTray from './StandbyTray';
import { useSlotDrag } from './useSlotDrag';

// Mirrors scheduler.ts. Not imported: scheduler.ts pulls in supabaseAdmin,
// which throws at module load in the browser.
const SLOT_EXCLUSION_MS = 75 * 60 * 1000;
const MIN_LEAD_MS = 10 * 60 * 1000;
const DAYS = 4;

type Item = ScheduledItem;

const isKV = (p: Item) => (p.claim_type || '').toUpperCase() === 'NEW_KEY_VISUAL';

function dayLabel(key: string, todayKey: string, tomorrowKey: string): string {
    if (key === todayKey) return 'Today';
    if (key === tomorrowKey) return 'Tomorrow';
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function etClock(iso: string): string {
    const mins = etMinutesOfDay(new Date(iso));
    const h = Math.floor(mins / 60), m = mins % 60;
    const ampm = h < 12 ? 'am' : 'pm';
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}${ampm}`;
}

export default function Clock({
    initialSlots = [],
    initialQueue = [],
}: {
    initialSlots?: PeakSlot[];
    initialQueue?: ScheduledItem[];
}) {
    const [slots, setSlots] = useState<PeakSlot[]>(initialSlots);
    const [items, setItems] = useState<Item[]>(initialQueue);
    const [loading, setLoading] = useState(initialSlots.length === 0);
    const [dayOffset, setDayOffset] = useState(0);
    const [selected, setSelected] = useState<string | null>(null);
    const [scoreFor, setScoreFor] = useState<Item | null>(null);
    const [editing, setEditing] = useState<{ index: number; time: string } | null>(null);
    const [savingSlots, setSavingSlots] = useState(false);
    const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
    const [now, setNow] = useState<Date>(() => new Date());
    const busy = useRef(false);

    // Live hand. 20s is plenty for a dial whose smallest tick is an hour.
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 20_000);
        return () => clearInterval(t);
    }, []);

    const load = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/engine/config', { cache: 'no-store' });
            const data = await res.json();
            if (data?.ok) { setSlots(data.slots || []); setItems(data.queue || []); }
        } catch { /* keep whatever is on screen */ }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { if (initialSlots.length === 0) load(); }, [load, initialSlots.length]);

    const todayKey = etDayKey(now);
    const tomorrowKey = etDayKey(new Date(now.getTime() + 86_400_000));
    const dayKeys = useMemo(
        () => Array.from({ length: DAYS }, (_, i) => etDayKey(new Date(now.getTime() + i * 86_400_000))),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [todayKey],
    );
    const shownDay = dayKeys[dayOffset] ?? todayKey;

    // Concrete peak-slot instants for the shown day (DST-safe, via et-time).
    // Keyed on the ET day rather than on `now` so the 20s hand tick doesn't
    // rebuild the slots underneath a drag.
    const daySlots = useMemo(() => {
        const out: { index: number; slot: PeakSlot; at: Date; minutes: number }[] = [];
        slots.forEach((slot, index) => {
            const at = etSlotInstant(new Date(), slot.time, dayOffset);
            const minutes = slotMinutesOfDay(slot.time);
            if (at && minutes != null) out.push({ index, slot, at, minutes });
        });
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slots, dayOffset, todayKey]);

    const scheduled = useMemo(() => items.filter(i => i.scheduled_post_time), [items]);
    const standby = useMemo(() => items.filter(i => !i.scheduled_post_time && !isKV(i)), [items]);

    /** post currently holding a slot instant (IG track only — KVs never claim one). */
    const occupantOf = useCallback((at: Date): Item | null => {
        return scheduled.find(p => !isKV(p) && Math.abs(new Date(p.scheduled_post_time!).getTime() - at.getTime()) < SLOT_EXCLUSION_MS) || null;
    }, [scheduled]);

    const dialSlots: DialSlot[] = useMemo(() => daySlots.map(({ slot, at }) => ({
        iso: at.toISOString(),
        label: slot.label,
        time: slot.time,
        minutes: slotMinutesOfDay(slot.time)!,
        occupantId: occupantOf(at)?.id ?? null,
        past: at.getTime() < now.getTime(),
    })), [daySlots, occupantOf, now]);

    const beads: DialBead[] = useMemo(() => {
        const onDay = scheduled.filter(p => etDayKey(new Date(p.scheduled_post_time!)) === shownDay);
        const buckets = new Map<string, number>();
        return onDay.map((p) => {
            const minutes = etMinutesOfDay(new Date(p.scheduled_post_time!));
            const kv = isKV(p);
            const key = `${kv ? 'k' : 'i'}:${Math.round(minutes / 20)}`;
            const ring = buckets.get(key) || 0;
            buckets.set(key, ring + 1);
            return { post: p as any, minutes, kv, color: scoreColor(p.post_score ?? 0), ring };
        });
    }, [scheduled, shownDay]);

    // ── the drag ───────────────────────────────────────────────────────────
    const applyUpdates = (updates: { id: string; scheduled_post_time: string | null }[]) => {
        setItems(prev => prev.map(p => {
            const u = updates.find(x => x.id === p.id);
            return u ? { ...p, scheduled_post_time: u.scheduled_post_time } : p;
        }));
    };

    const onDrop = useCallback(async (postId: string, slotIso: string) => {
        if (busy.current) return;
        const post = items.find(p => p.id === postId);
        const target = dialSlots.find(s => s.iso === slotIso);
        if (!post || !target) return;

        if (isKV(post)) {
            setMsg({ tone: 'warn', text: 'Key visuals are Facebook-only and run on their own hourly grid. They cannot take an Instagram peak slot.' });
            return;
        }
        if (new Date(slotIso).getTime() - Date.now() < MIN_LEAD_MS) {
            setMsg({ tone: 'warn', text: 'That slot is too close to now to book. Pick a later one.' });
            return;
        }
        const occupant = target.occupantId ? items.find(p => p.id === target.occupantId) || null : null;
        if (occupant?.id === postId) return;

        const scheduledNow = !!post.scheduled_post_time;
        const action = occupant
            ? (scheduledNow ? 'swap' : 'cascade')
            : (scheduledNow ? 'move' : 'assign');

        const snapshot = items;
        // Optimistic: the swap/cascade partner's real destination comes back
        // from the server, so only the certain half is pre-applied.
        const optimistic: { id: string; scheduled_post_time: string | null }[] =
            action === 'swap'
                ? [{ id: postId, scheduled_post_time: slotIso }, { id: occupant!.id, scheduled_post_time: post.scheduled_post_time }]
                : [{ id: postId, scheduled_post_time: slotIso }];
        applyUpdates(optimistic);
        setMsg(null);
        busy.current = true;

        try {
            const res = await fetch('/api/admin/engine/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action,
                    postId,
                    toTime: slotIso,
                    targetPostId: action === 'swap' ? occupant!.id : undefined,
                    occupantId: action === 'cascade' ? occupant!.id : undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data?.ok) {
                setItems(snapshot);                      // roll back
                setMsg({ tone: 'warn', text: data?.reason || 'The schedule change was refused.' });
                return;
            }
            applyUpdates(data.updates || optimistic);    // authoritative
            setMsg({
                tone: 'ok',
                text: data.cascaded
                    ? `Scheduled. "${data.cascaded.title}" moved to ${data.cascaded.label} ${etClock(data.cascaded.to)} ET.`
                    : action === 'swap' ? 'Swapped.' : 'Scheduled.',
            });
        } catch (e: any) {
            setItems(snapshot);
            setMsg({ tone: 'warn', text: e?.message || 'Network error — nothing was changed.' });
        } finally {
            busy.current = false;
        }
    }, [items, dialSlots]);

    const onTap = useCallback((postId: string) => {
        setSelected(cur => (cur === postId ? null : postId));
    }, []);

    const { drag, bind } = useSlotDrag({ onDrop, onTap });

    // ── peak-slot time editing (existing savePeakSlots path) ───────────────
    const saveSlots = async (next: PeakSlot[]) => {
        setSavingSlots(true);
        setMsg(null);
        try {
            const res = await fetch('/api/admin/engine/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'savePeakSlots', slots: next }),
            });
            const data = await res.json();
            if (!res.ok || !data?.ok) { setMsg({ tone: 'warn', text: data?.reason || 'Save failed.' }); return; }
            setSlots(next);
            setEditing(null);
            setMsg({ tone: 'ok', text: 'Peak slots saved.' });
        } catch (e: any) {
            setMsg({ tone: 'warn', text: e?.message || 'Network error.' });
        } finally { setSavingSlots(false); }
    };

    const selectedPost = selected ? items.find(p => p.id === selected) || null : null;
    const dragPost = drag ? items.find(p => p.id === drag.postId) || null : null;

    return (
        <div className="ak-card jarvis" style={{ overflow: 'hidden' }}>
            <div className="flex items-baseline justify-between" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                <span className="ak-overline" style={{ color: 'var(--gold, #e6c489)' }}>Schedule · 24h ET</span>
                <button className="ak-btn ak-btn--ghost ak-btn--xs" onClick={load} disabled={loading}>
                    <RefreshCw size={12} className={loading ? 'ak-spin' : ''} /> Refresh
                </button>
            </div>
            <div className="ak-caption" style={{ marginBottom: 10 }}>
                Midnight at the top, clockwise. Gold arcs are the peak slots (tap to edit). Drag a bead or a standby
                post onto an arc to schedule it. Hollow inner beads are Facebook key visuals, a separate track.
            </div>

            {/* day tabs */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                {dayKeys.map((k, i) => (
                    <button
                        key={k}
                        className={`ak-btn ak-btn--xs ${i === dayOffset ? 'ak-btn--primary' : 'ak-btn--ghost'}`}
                        onClick={() => { setDayOffset(i); setEditing(null); }}
                    >
                        {dayLabel(k, todayKey, tomorrowKey)}
                    </button>
                ))}
            </div>

            <Dial
                slots={dialSlots}
                beads={beads}
                nowMinutes={shownDay === todayKey ? etMinutesOfDay(now) : null}
                overSlot={drag?.overSlot ?? null}
                selectedId={selected}
                onSlotClick={(iso) => {
                    const ds = daySlots.find(d => d.at.toISOString() === iso);
                    if (ds) setEditing({ index: ds.index, time: ds.slot.time });
                }}
                bindBead={bind}
            />

            {/* slot legend / inline editor */}
            <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                {dialSlots.map((s, i) => {
                    const occ = s.occupantId ? items.find(p => p.id === s.occupantId) : null;
                    const isEditing = editing?.index === daySlots[i]?.index;
                    return (
                        <div key={s.iso} className="ak-uprow" style={{ padding: '8px 10px', gap: 8, alignItems: 'center', flexWrap: 'wrap', opacity: s.past ? 0.55 : 1 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--gold, #e6c489)', flexShrink: 0 }} />
                            <button
                                className="ak-btn ak-btn--ghost ak-btn--xs"
                                onClick={() => setEditing(isEditing ? null : { index: daySlots[i].index, time: s.time })}
                                style={{ flexShrink: 0 }}
                            >
                                <ClockIcon size={12} /> {s.label} · {s.time} ET
                            </button>
                            {isEditing ? (
                                <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <input
                                        type="time"
                                        value={editing!.time}
                                        onChange={(e) => setEditing({ index: editing!.index, time: e.target.value })}
                                        style={{ background: 'var(--surface-2, rgba(255,255,255,0.04))', border: '1px solid var(--line, #24303f)', borderRadius: 8, padding: '4px 7px', color: 'var(--ink, #e8eef7)', fontVariantNumeric: 'tabular-nums' }}
                                    />
                                    <button
                                        className="ak-btn ak-btn--primary ak-btn--xs"
                                        disabled={savingSlots}
                                        onClick={() => saveSlots(slots.map((sl, idx) => (idx === editing!.index ? { ...sl, time: editing!.time } : sl)))}
                                    >
                                        {savingSlots ? 'Saving…' : 'Save'}
                                    </button>
                                    <button className="ak-btn ak-btn--ghost ak-btn--xs" onClick={() => setEditing(null)}>Cancel</button>
                                </span>
                            ) : (
                                <span className="ak-body-sm" style={{ color: occ ? 'var(--ink, #e8eef7)' : 'var(--ink-3, #7d8ea3)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                    {occ ? occ.title : 'open'}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            {msg && (
                <div
                    className="ak-caption"
                    role="status"
                    style={{
                        marginTop: 10, display: 'flex', gap: 7, alignItems: 'flex-start',
                        color: msg.tone === 'ok' ? 'var(--ok, #35c88a)' : 'var(--sun, #ff7a6b)',
                    }}
                >
                    {msg.tone === 'ok' ? <Check size={13} style={{ flexShrink: 0, marginTop: 2 }} /> : <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} />}
                    <span style={{ minWidth: 0 }}>{msg.text}</span>
                </div>
            )}

            {/* selected bead detail */}
            {selectedPost && (
                <div className="ak-uprow" style={{ marginTop: 12, padding: 10, flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                    <div className="flex items-baseline justify-between" style={{ gap: 8 }}>
                        <span className="ak-overline">{isKV(selectedPost) ? 'Key visual · Facebook' : 'Scheduled post'}</span>
                        <button className="ak-btn ak-btn--ghost ak-btn--xs" onClick={() => setSelected(null)} aria-label="Close"><X size={12} /></button>
                    </div>
                    <div className="ak-body-sm" style={{ color: 'var(--ink, #e8eef7)', fontWeight: 600 }}>{selectedPost.title}</div>
                    <div className="ak-caption">
                        {selectedPost.scheduled_post_time
                            ? `${etClock(selectedPost.scheduled_post_time)} ET · ${etDayKey(new Date(selectedPost.scheduled_post_time))}`
                            : 'Standby — no slot yet'}
                        {selectedPost.claim_type ? ` · ${selectedPost.claim_type}` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button className="ak-btn ak-btn--ghost ak-btn--xs" onClick={() => setScoreFor(selectedPost)}>
                            Score {selectedPost.post_score ?? '—'}/100
                        </button>
                        <span className="ak-caption">Score as of the last automatic booking. A manual drag does not re-score.</span>
                    </div>
                </div>
            )}

            <StandbyTray posts={standby as any} bind={bind} selectedId={selected} />

            {/* drag ghost */}
            {drag?.moved && dragPost && (
                <div
                    style={{
                        position: 'fixed', left: drag.x + 12, top: drag.y - 10, zIndex: 60,
                        pointerEvents: 'none', maxWidth: 220, padding: '5px 9px', borderRadius: 9,
                        background: 'var(--surface, #10161f)', border: `1px solid ${drag.overSlot ? 'var(--gold, #e6c489)' : 'var(--line, #24303f)'}`,
                        color: 'var(--ink, #e8eef7)', fontSize: '0.78rem',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                >
                    {dragPost.title}
                </div>
            )}

            {scoreFor && (
                <ScoreBreakdownPopup
                    title={scoreFor.title}
                    breakdown={(scoreFor.score_breakdown as PostScore) || null}
                    onClose={() => setScoreFor(null)}
                />
            )}
        </div>
    );
}
