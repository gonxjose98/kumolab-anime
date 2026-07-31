'use client';

/**
 * The standby pool — approved posts with no slot yet, best score first.
 *
 * Drag a chip onto a gold arc to give it that slot. There is deliberately no
 * gesture that sends a post BACK here: pool membership is
 * `scheduled_post_time IS NULL`, and the scheduler's pruner can demote a
 * pooled post to 'pending'. Dropping a scheduled post into the tray would
 * therefore be a quiet unapprove, so the tray is a source, never a target.
 */

import { scoreColor } from '@/components/admin/ScoreBreakdownPopup';
import type { BeadPost } from './Bead';

export default function StandbyTray({
    posts, bind, selectedId,
}: {
    posts: BeadPost[];
    bind: (postId: string) => Record<string, unknown>;
    selectedId: string | null;
}) {
    const sorted = [...posts].sort((a, b) => (b.post_score ?? 0) - (a.post_score ?? 0));

    return (
        <div style={{ marginTop: 14 }}>
            <div className="flex items-baseline justify-between" style={{ gap: 8, marginBottom: 6 }}>
                <span className="ak-overline" style={{ color: 'var(--blue, #6fb2ff)' }}>Standby pool</span>
                <span className="ak-caption">{sorted.length} waiting</span>
            </div>
            {sorted.length === 0 ? (
                <div className="ak-caption">Empty. Every approved post currently holds a slot.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {sorted.map((p) => {
                        const c = scoreColor(p.post_score ?? 0);
                        return (
                            <div
                                key={p.id}
                                {...(bind(p.id) as any)}
                                title={`${p.title} — drag onto a gold slot to schedule`}
                                style={{
                                    ...(bind(p.id) as any).style,
                                    display: 'flex', alignItems: 'center', gap: 9,
                                    padding: '7px 10px', minWidth: 0,
                                    border: `1px solid ${selectedId === p.id ? c : 'var(--line, #24303f)'}`,
                                    borderRadius: 10,
                                    background: 'var(--surface-2, rgba(255,255,255,0.03))',
                                }}
                            >
                                <span
                                    aria-hidden
                                    style={{ width: 9, height: 9, borderRadius: 999, background: c, flexShrink: 0, boxShadow: `0 0 6px ${c}` }}
                                />
                                <span
                                    className="ak-body-sm"
                                    style={{ color: 'var(--ink, #e8eef7)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                >
                                    {p.title}
                                </span>
                                <span className="ak-caption" style={{ color: c, fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                    {p.post_score ?? '—'}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
