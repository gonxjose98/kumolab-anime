'use client';

import { X, Check, AlertTriangle } from 'lucide-react';
import type { PostScore } from '@/lib/engine/scoring';

/**
 * Shared /100 score breakdown popup.
 *
 * One presentation for both places a score is tappable:
 *   • Engine → Scheduled feed (score column)
 *   • Dashboard → Needs your review (score chip on each pending row)
 *
 * Reads straight from posts.score_breakdown — never recomputes. `actions`
 * lets a caller hang extra controls off the footer (the dashboard puts
 * "Find Video" there so the pending rows stay uncluttered).
 */

const VERDICT_STYLE: Record<string, { color: string; label: string }> = {
    AUTO_PUBLISH: { color: 'var(--ok)', label: 'Auto-publish' },
    REVIEW: { color: 'var(--warn)', label: 'Review' },
    REJECT: { color: 'var(--sun)', label: 'Reject' },
};

const GATE_LABEL: Record<string, string> = {
    tracked_franchise: 'Tracked franchise',
    min_video_quality: 'Video ≥720p / ≥1.2 Mbps',
    category_allowed: 'Publishable category',
    no_fake_motion_on_tiered: 'No fake motion on a tiered show',
    trailer_has_video: 'Trailer carries a video',
    anime_only: 'Anime (not live action or games)',
};

export function scoreColor(score: number): string {
    if (score >= 75) return 'var(--ok)';
    if (score >= 55) return 'var(--warn)';
    return 'var(--sun)';
}

export default function ScoreBreakdownPopup({
    title,
    breakdown,
    onClose,
    actions,
}: {
    title: string;
    breakdown: PostScore | null;
    onClose: () => void;
    actions?: React.ReactNode;
}) {
    const bd = breakdown;
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
                        <div className="ak-body-sm" style={{ color: 'var(--ink)', fontWeight: 600, marginTop: 2 }}>{title}</div>
                    </div>
                    <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={onClose} aria-label="Close">
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
                                        ? <Check size={13} style={{ color: 'var(--ok)', flexShrink: 0 }} />
                                        : <AlertTriangle size={13} style={{ color: 'var(--sun)', flexShrink: 0 }} />}
                                    <span className="ak-caption" style={{ color: g.passed ? 'var(--ink-2)' : 'var(--sun)' }}>
                                        {GATE_LABEL[g.gate] || g.gate}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {actions && (
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                        {actions}
                    </div>
                )}
            </div>
        </div>
    );
}
