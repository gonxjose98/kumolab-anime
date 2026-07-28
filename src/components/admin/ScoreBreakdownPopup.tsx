'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
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
 *
 * PORTALLED to document.body on purpose: .ak-card sets backdrop-filter, which
 * makes it a containing block for position:fixed descendants, and
 * .ak-card--flush adds overflow:hidden. Rendered in place inside the pending
 * card this modal anchored to the CARD instead of the viewport — it opened
 * part-scrolled with its header (and the close button) unreachable on a phone.
 * Same trap FindVideoButton and the review preview already work around.
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
    // Escape closes — a modal you can only dismiss by tapping precisely is the
    // same complaint in a different form.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const bd = breakdown;
    const verdict = bd ? (VERDICT_STYLE[bd.verdict] || VERDICT_STYLE.REVIEW) : null;

    // No mounted-flag dance needed: callers only render this once the operator
    // has clicked, so it never exists during SSR.
    if (typeof document === 'undefined') return null;

    return createPortal(
        <div className="admin-root">
            <div className="ak-modal__scrim ak-modal__scrim--safe" onClick={onClose}>
                <div
                    className="ak-modal ak-score"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Score breakdown"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="ak-score__head">
                        <div style={{ minWidth: 0 }}>
                            <span className="ak-overline">Score breakdown</span>
                            <div className="ak-body-sm" style={{ color: 'var(--ink)', fontWeight: 600, marginTop: 2 }}>
                                {title}
                            </div>
                        </div>
                        <button
                            className="ak-btn ak-btn--ghost ak-btn--xs ak-btn--pill"
                            onClick={onClose}
                            aria-label="Close"
                            style={{ padding: '0 8px', flexShrink: 0 }}
                        >
                            <X size={14} />
                        </button>
                    </div>

                    <div className="ak-score__body">
                        {!bd ? (
                            <div className="ak-caption">
                                No breakdown stored for this post (scored before the /100 model went live).
                            </div>
                        ) : (
                            <>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
                                    <span className="ak-score__total" style={{ color: scoreColor(bd.total) }}>
                                        {bd.total}
                                        <span style={{ fontSize: '0.9rem', color: 'var(--ink-3)', fontWeight: 600 }}>/100</span>
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

                                {(bd.components || []).map((c) => (
                                    <div key={c.label} className="ak-score__row">
                                        <div className="flex items-baseline justify-between" style={{ gap: 12 }}>
                                            <span className="ak-body-sm" style={{ color: 'var(--ink)', fontWeight: 600 }}>{c.label}</span>
                                            <span className="ak-score__pts" style={c.earned === 0 ? { color: 'var(--ink-3)' } : undefined}>
                                                {c.earned}
                                                <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>/{c.max}</span>
                                            </span>
                                        </div>
                                        <div className="ak-caption" style={{ marginTop: 2 }}>{c.reason}</div>
                                    </div>
                                ))}

                                <div className="ak-overline" style={{ margin: '16px 0 8px' }}>Hard gates</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    {(bd.hard_gates || []).map((g) => (
                                        <div key={g.gate} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
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
                    </div>

                    {actions && <div className="ak-score__foot">{actions}</div>}
                </div>
            </div>
        </div>,
        document.body,
    );
}
