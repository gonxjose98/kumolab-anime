'use client';

import { useState } from 'react';
import type { PostScore } from '@/lib/engine/scoring';
import ScoreBreakdownPopup, { scoreColor } from '@/components/admin/ScoreBreakdownPopup';
import FindVideoButton from './FindVideoButton';

/**
 * The /100 score chip on a pending row. Tapping it opens the same breakdown
 * popup the Engine tab uses (components + hard gates, read from
 * posts.score_breakdown — no recompute).
 *
 * "Find Video" lives in the popup's footer rather than on the row itself:
 * it's an occasional action, and inline it crowded every row's action
 * cluster. The chip always renders — even for posts scored before the /100
 * model shipped — so the popup (and Find Video) is never unreachable.
 */
export default function PendingScoreChip({
    postId,
    postTitle,
    postScore,
    breakdown,
}: {
    postId: string;
    postTitle: string;
    postScore: number | null;
    breakdown: PostScore | null;
}) {
    const [open, setOpen] = useState(false);
    const has = typeof postScore === 'number';

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                title={has ? 'Show score breakdown' : 'No score stored — open for options'}
                className="ak-badge ak-badge--bare"
                style={{
                    cursor: 'pointer',
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    background: 'var(--surface-2)',
                    borderColor: 'var(--line)',
                    color: has ? scoreColor(postScore!) : 'var(--ink-3)',
                }}
            >
                {has ? postScore : '—'}
                <span style={{ color: 'var(--ink-3)', fontWeight: 500 }}>/100</span>
            </button>

            {open && (
                <ScoreBreakdownPopup
                    title={postTitle}
                    breakdown={breakdown}
                    onClose={() => setOpen(false)}
                    actions={
                        <div className="flex items-center justify-between gap-3">
                            <span className="ak-caption">
                                Still image? Pull the video version in.
                            </span>
                            <FindVideoButton postId={postId} postTitle={postTitle} />
                        </div>
                    }
                />
            )}
        </>
    );
}
