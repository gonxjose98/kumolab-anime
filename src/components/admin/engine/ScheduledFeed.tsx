'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, CalendarClock, X, Check, AlertTriangle } from 'lucide-react';
import type { ScheduledItem, PeakSlot } from '@/lib/engine/engine-config';
import type { PostScore } from '@/lib/engine/scoring';

/**
 * Live, read-only mirror of what Content → Schedule has queued. Changes nothing
 * there; just surfaces the upcoming approved posts inside the Engine view, each
 * tagged with the peak slot it lands nearest. Standby rows (pooled, no slot
 * yet) sit at the bottom awaiting selection. Each post shows its /100 score;
 * clicking the score opens the full breakdown (components + hard gates) read
 * straight from posts.score_breakdown — no recompute. Refreshes on mount,
 * every 60s, and on demand.
 */

const CLAIM_LABEL: Record<string, string> = {
    TRAILER_DROP: 'Trailer', NEW_KEY_VISUAL: 'Key Visual', NEW_SEASON_CONFIRMED: 'New Season',
    DATE_ANNOUNCED: 'Release Date', DELAY: 'Delay', CAST_ADDITION: 'Cast', STAFF_UPDATE: 'Staff', OTHER: 'News',
};

const VERDICT_STYLE: Record<string, { color: string; label: string }> = {
    AUTO_PUBLISH: { color: '#35a877', label: 'Auto-publish' },
    REVIEW: { color: '#d99a2b', label: 'Review' },
    REJECT: { color: '#d9534f', label: 'Reject' },
};

const GATE_LABEL: Record<string, string> = {
    tracked_franchise: 'Tracked franchise',
    min_video_quality: 'Video ≥720p / ≥1.2 Mbps',
    category_allowed: 'Publishable category',
    no_fake_motion_on_tiered: 'No fake motion on a tiered show',
    trailer_has_video: 'Trailer carries a video',
};

/** ET minutes-of-day for an ISO timestamp. */
function etMinutes(iso: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(iso));
    const h = Number(parts.find((p) => p.type === 'hour')?.value || 0);
    const m = Number(parts.find((p) => p.type === 'minute')?.value || 0);
    return h * 60 + m;
}

function slotMinutes(hhmm: string): number {
    const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
}

/** Nearest peak slot to a scheduled time (circular distance over 24h). */
function nearestSlot(iso: string, slots: PeakSlot[]): PeakSlot | null {
    if (!slots.length) return null;
    const mins = etMinutes(iso);
    let best: PeakSlot | null = null;
    let bestD = Infinity;
    for (const s of slots) {
        const d0 = Math.abs(mins - slotMinutes(s.time));
        const d = Math.min(d0, 1440 - d0);
        if (d < bestD) { bestD = d; best = s; }
    }
    return best;
}

function fmtET(iso: string): string {
    return new Date(iso).toLocaleString('en-US', {
        timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit',
    });
}

function scoreColor(score: number): string {
    if (score >= 75) return '#35a877';
    if (score >= 55) return '#d99a2b';
    return '#d9534f';
}

// ── Score breakdown popup ───────────────────────────────────────

function ScorePopup({ item, onClose }: { item: ScheduledItem; onClose: () => void }) {
    const bd = item.score_breakdown as PostScore | null;
    const verdict = bd ? (VERDICT_STYLE[bd.verdict] || VERDICT_STYLE.REVIEW) : null;
    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 60,
                background: 'rgba(10, 16, 26, 0.55)', backdropFilter: 'blur(2px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
            }}
        >
            <div
                className="ak-card"
                onClick={(e) => e.stopPropagation()}
                style={{ width: 'min(440px, 100%)', maxHeight: '82vh', overflowY: 'auto', padding: 16 }}
            >
                <div className="flex items-start justify-between" style={{ gap: 8, marginBottom: 8 }}>
                    <div style={{ minWidth: 0 }}>
                        <span className="ak-overline">Score breakdown</span>
                        <div className="ak-body-sm" style={{ color: 'var(--ink)', fontWeight: 600, marginTop: 2 }}>{item.title}</div>
                    </div>
                    <button className="ak-syncm__btn" onClick={onClose} aria-label="Close">
                        <X size={13} />
                    </button>
                </div>

                {!bd ? (
                    <div className="ak-caption" style={{ padding: '12px 0' }}>
                        No breakdown stored for this post (scored before the /100 model went live).
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                            <span style={{ fontFamily: 'var(--ak-display)', fontWeight: 800, fontSize: '1.6rem', color: scoreColor(bd.total), fontVariantNumeric: 'tabular-nums' }}>
                                {bd.total}<span style={{ fontSize: '0.9rem', color: 'var(--ink-3)' }}>/100</span>
                            </span>
                            {verdict && (
                                <span className="ak-caption" style={{
                                    color: verdict.color, border: `1px solid ${verdict.color}`,
                                    borderRadius: 999, padding: '2px 10px', fontWeight: 700,
                                    textTransform: 'uppercase', letterSpacing: '0.05em',
                                }}>
                                    {verdict.label}
                                </span>
                            )}
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table className="ak-table" style={{ width: '100%' }}>
                                <thead>
                                    <tr>
                                        <th>Component</th>
                                        <th style={{ width: 70, textAlign: 'right' }}>Points</th>
                                        <th>Why</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(bd.components || []).map((c) => (
                                        <tr key={c.label}>
                                            <td className="ak-body-sm" style={{ color: 'var(--ink)', whiteSpace: 'nowrap' }}>{c.label}</td>
                                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: c.earned > 0 ? 'var(--ink)' : 'var(--ink-3)' }}>
                                                {c.earned}<span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>/{c.max}</span>
                                            </td>
                                            <td className="ak-caption">{c.reason}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="ak-overline" style={{ margin: '14px 0 6px' }}>Hard gates</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {(bd.hard_gates || []).map((g) => (
                                <div key={g.gate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {g.passed
                                        ? <Check size={13} style={{ color: '#35a877', flexShrink: 0 }} />
                                        : <AlertTriangle size={13} style={{ color: '#d9534f', flexShrink: 0 }} />}
                                    <span className="ak-caption" style={{ color: g.passed ? 'var(--ink-2)' : '#d9534f' }}>
                                        {GATE_LABEL[g.gate] || g.gate}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ── Feed ────────────────────────────────────────────────────────

export default function ScheduledFeed({ initial, slots }: { initial: ScheduledItem[]; slots: PeakSlot[] }) {
    const [queue, setQueue] = useState<ScheduledItem[]>(initial);
    const [loading, setLoading] = useState(false);
    const [openId, setOpenId] = useState<string | null>(null);

    const refresh = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/engine/config', { cache: 'no-store' });
            const data = await res.json();
            if (data?.queue) setQueue(data.queue);
        } catch {
            // keep prior queue on failure
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const t = setInterval(refresh, 60_000);
        return () => clearInterval(t);
    }, []);

    const openItem = openId ? queue.find((q) => q.id === openId) || null : null;

    return (
        <div className="ak-card ak-card--flush">
            <div className="flex items-center justify-between" style={{ gap: 8, padding: '16px 18px 10px' }}>
                <div>
                    <span className="ak-overline" style={{ color: '#35a877' }}>Scheduled · live</span>
                    <div className="ak-caption" style={{ marginTop: 2 }}>
                        Mirrors Content → Schedule. Standby rows wait in the pool for the next peak slot. Tap a score for the breakdown.
                    </div>
                </div>
                <button className="ak-syncm__btn" onClick={refresh} disabled={loading}>
                    <RefreshCw size={13} className={loading ? 'ak-spin' : ''} /> Refresh
                </button>
            </div>
            {queue.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 18px' }}>
                    <CalendarClock size={20} style={{ color: 'var(--ink-3)', marginBottom: 8 }} />
                    <div className="ak-caption">Nothing scheduled ahead right now.</div>
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table className="ak-table">
                        <thead>
                            <tr>
                                <th style={{ width: 110 }}>When (ET)</th>
                                <th style={{ width: 90 }}>Slot</th>
                                <th>Post</th>
                                <th style={{ width: 64 }}>Score</th>
                                <th style={{ width: 90 }}>Type</th>
                            </tr>
                        </thead>
                        <tbody>
                            {queue.map((item) => {
                                const slot = item.scheduled_post_time ? nearestSlot(item.scheduled_post_time, slots) : null;
                                return (
                                    <tr key={item.id}>
                                        <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ink)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                            {item.scheduled_post_time
                                                ? fmtET(item.scheduled_post_time)
                                                : <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>Standby</span>}
                                        </td>
                                        <td>
                                            <span className="ak-caption" style={{ color: slot ? 'var(--ink-2)' : 'var(--ink-3)' }}>
                                                {slot ? slot.label : '—'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="ak-body-sm" style={{ color: 'var(--ink)' }}>{item.title}</span>
                                        </td>
                                        <td>
                                            {typeof item.post_score === 'number' ? (
                                                <button
                                                    onClick={() => setOpenId(item.id)}
                                                    title="Show score breakdown"
                                                    style={{
                                                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                                                        fontVariantNumeric: 'tabular-nums', fontWeight: 800,
                                                        color: scoreColor(item.post_score),
                                                        textDecoration: 'underline dotted', textUnderlineOffset: 3,
                                                        fontSize: '0.9rem',
                                                    }}
                                                >
                                                    {item.post_score}
                                                </button>
                                            ) : (
                                                <span className="ak-caption" style={{ color: 'var(--ink-3)' }}>—</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className="ak-caption" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                {item.claim_type ? (CLAIM_LABEL[item.claim_type] || 'News') : '—'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            {openItem && <ScorePopup item={openItem} onClose={() => setOpenId(null)} />}
        </div>
    );
}
