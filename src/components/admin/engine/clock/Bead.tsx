'use client';

/**
 * One post on the dial rim, at its true ET angle.
 *
 * Two tracks, because the pipeline runs two scheduling products: Instagram
 * peak-slot posts are solid beads on the outer rim; NEW_KEY_VISUAL posts are
 * Facebook-only, live on their own off-peak hourly grid with their own cap,
 * and are drawn hollow on an inner track so the dial never implies they
 * compete for the same three slots.
 */

export interface BeadPost {
    id: string;
    title: string;
    claim_type: string | null;
    scheduled_post_time: string | null;
    post_score: number | null;
    score_breakdown: unknown;
}

export default function Bead({
    x, y, color, hollow, active, dim, label, bind,
}: {
    x: number;
    y: number;
    color: string;
    hollow: boolean;
    active: boolean;
    dim: boolean;
    label: string;
    bind: Record<string, unknown>;
}) {
    const r = active ? 7.5 : 5.5;
    return (
        <g
            {...(bind as any)}
            opacity={dim ? 0.35 : 1}
            role="button"
            tabIndex={0}
            aria-label={label}
        >
            <title>{label}</title>
            {active && <circle cx={x} cy={y} r={13} fill={color} opacity={0.18} />}
            <circle
                cx={x}
                cy={y}
                r={r}
                fill={hollow ? 'transparent' : color}
                stroke={color}
                strokeWidth={hollow ? 1.8 : 1}
                style={{ filter: active ? `drop-shadow(0 0 6px ${color})` : undefined }}
            />
            {/* Generous invisible hit area — 5px beads are not a touch target. */}
            <circle cx={x} cy={y} r={16} fill="transparent" />
        </g>
    );
}
