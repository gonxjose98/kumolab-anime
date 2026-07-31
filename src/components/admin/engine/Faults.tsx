'use client';

import { useState } from 'react';
import {
    AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight,
    Crosshair, ExternalLink, ShieldCheck, Clock, RefreshCw,
} from 'lucide-react';
import type { Fault, FaultLevel } from '@/lib/engine/faults';

/**
 * Faults — the diagnostics panel under the blueprint canvas.
 *
 * Three merged fault sources rendered as one list, worst first. Crits and
 * warnings are open; the healthy checks are collapsed behind a count, because
 * the normal state of this panel is "nothing is wrong" and that state should
 * read as deliberate calm rather than as an empty box.
 *
 * A fault carrying a `nodeId` is clickable: it hands the id up via `onFocusNode`
 * so the canvas can fly to the part of the system that broke. That join is the
 * whole reason the fault list lives next to the map.
 *
 * ALWAYS DARK. The palette is pinned locally to the same night values
 * `jarvis.css` sets, so this panel keeps its console look whether or not it is
 * rendered inside a `.jarvis` subtree and regardless of the admin theme toggle.
 */

const JARVIS_VARS = {
    '--gold': '#e6c489',
    '--blue': '#6fb2ff',
    '--ok': '#35c88a',
    '--sun': '#ff7a6b',
    '--warn': '#ffc46b',
    '--ink': '#f2f9ff',
    '--ink-2': 'rgba(226, 240, 255, 0.72)',
    '--ink-3': 'rgba(200, 220, 245, 0.42)',
    '--line': 'rgba(226, 176, 90, 0.26)',
    '--surface': 'rgba(12, 18, 44, 0.62)',
    '--surface-2': 'rgba(18, 26, 56, 0.72)',
} as React.CSSProperties;

const LEVEL_COLOR: Record<FaultLevel, string> = {
    crit: 'var(--sun)',
    warn: 'var(--warn)',
    ok: 'var(--ok)',
};

const SOURCE_LABEL: Record<Fault['source'], string> = {
    health: 'health',
    error: 'error log',
    stuck: 'stuck post',
};

function LevelIcon({ level, size = 15 }: { level: FaultLevel; size?: number }) {
    const props = { size, strokeWidth: 2.2, style: { color: LEVEL_COLOR[level], flexShrink: 0 } };
    if (level === 'crit') return <AlertOctagon {...props} />;
    if (level === 'warn') return <AlertTriangle {...props} />;
    return <CheckCircle2 {...props} />;
}

function ageLabel(minutes: number | null): string {
    if (minutes === null) return 'never checked';
    if (minutes < 1) return 'checked just now';
    if (minutes < 60) return `checked ${minutes} min ago`;
    const h = Math.floor(minutes / 60);
    if (h < 24) return `checked ${h}h ago`;
    return `checked ${Math.floor(h / 24)}d ago`;
}

// A snapshot older than two health-monitor cycles means the cron itself is the
// thing that is broken, and every level below is untrustworthy. Say so.
const STALE_AFTER_MIN = 70;

function FaultRow({
    fault, onFocusNode,
}: { fault: Fault; onFocusNode?: (nodeId: string) => void }) {
    const focusable = !!fault.nodeId && !!onFocusNode;
    const focus = () => { if (fault.nodeId && onFocusNode) onFocusNode(fault.nodeId); };

    return (
        <div
            role={focusable ? 'button' : undefined}
            tabIndex={focusable ? 0 : undefined}
            onClick={focusable ? focus : undefined}
            onKeyDown={focusable ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focus(); }
            } : undefined}
            title={focusable ? 'Show this on the map' : undefined}
            style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '10px 12px', borderRadius: 10, minWidth: 0,
                background: 'var(--surface)',
                border: '1px solid rgba(111, 178, 255, 0.14)',
                borderLeft: `2px solid ${LEVEL_COLOR[fault.level]}`,
                cursor: focusable ? 'pointer' : 'default',
            }}
        >
            <span style={{ paddingTop: 1 }}><LevelIcon level={fault.level} /></span>

            <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{
                        fontSize: '0.86rem', fontWeight: 700, color: 'var(--ink)',
                        overflowWrap: 'anywhere',
                    }}>{fault.label}</span>
                    <span style={{
                        fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em',
                        textTransform: 'uppercase', color: 'var(--ink-3)',
                    }}>{SOURCE_LABEL[fault.source]}</span>
                </div>

                {fault.detail && (
                    <div style={{
                        fontSize: '0.78rem', color: 'var(--ink-2)', marginTop: 2,
                        overflowWrap: 'anywhere',
                    }}>{fault.detail}</div>
                )}

                {fault.actionable && (
                    <div style={{
                        fontSize: '0.75rem', color: 'var(--gold)', marginTop: 5,
                        display: 'flex', gap: 6, alignItems: 'flex-start', overflowWrap: 'anywhere',
                    }}>
                        <span aria-hidden style={{ opacity: 0.8 }}>→</span>
                        <span>{fault.actionable}</span>
                    </div>
                )}

                {(fault.href || focusable) && (
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 7 }}>
                        {fault.href && (
                            <a
                                href={fault.href}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    fontSize: '0.72rem', fontWeight: 700, color: 'var(--blue)',
                                    textDecoration: 'none', overflowWrap: 'anywhere',
                                }}
                            >
                                <ExternalLink size={12} strokeWidth={2.4} />
                                Open fix
                            </a>
                        )}
                        {focusable && (
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                fontSize: '0.72rem', fontWeight: 700, color: 'var(--ink-3)',
                            }}>
                                <Crosshair size={12} strokeWidth={2.4} />
                                {fault.nodeId}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function Group({
    level, faults, defaultOpen, onFocusNode,
}: {
    level: FaultLevel;
    faults: Fault[];
    defaultOpen: boolean;
    onFocusNode?: (nodeId: string) => void;
}) {
    const [open, setOpen] = useState(defaultOpen);
    if (faults.length === 0) return null;

    const title = level === 'crit' ? 'Critical' : level === 'warn' ? 'Warnings' : 'Healthy';

    return (
        <section style={{ minWidth: 0 }}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                style={{
                    display: 'flex', alignItems: 'center', gap: 7, width: '100%',
                    background: 'transparent', border: 'none', padding: '4px 0',
                    cursor: 'pointer', color: 'var(--ink-2)', textAlign: 'left',
                }}
            >
                {open
                    ? <ChevronDown size={14} strokeWidth={2.4} style={{ flexShrink: 0 }} />
                    : <ChevronRight size={14} strokeWidth={2.4} style={{ flexShrink: 0 }} />}
                <span style={{
                    fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: LEVEL_COLOR[level],
                }}>{title}</span>
                <span style={{
                    fontSize: '0.7rem', fontWeight: 700, color: 'var(--ink-3)',
                    fontVariantNumeric: 'tabular-nums',
                }}>{faults.length}</span>
            </button>

            {open && (
                <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                    {faults.map((f) => (
                        <FaultRow key={f.key} fault={f} onFocusNode={onFocusNode} />
                    ))}
                </div>
            )}
        </section>
    );
}

export default function Faults({
    faults,
    healthAgeMinutes,
    onFocusNode,
    onRecheck,
}: {
    faults: Fault[];
    healthAgeMinutes: number | null;
    /** Focus this node on the blueprint canvas. Wired up by the canvas owner. */
    onFocusNode?: (nodeId: string) => void;
    /**
     * Optional re-check affordance. Left to the caller on purpose: the only
     * route that recomputes health is `/api/cron?worker=health-monitor`, which
     * requires cron auth the browser does not have, so a button wired straight
     * at it would be permanently broken. Pass a handler that goes through an
     * authenticated admin route and the button appears.
     */
    onRecheck?: () => void;
}) {
    const crit = faults.filter((f) => f.level === 'crit');
    const warn = faults.filter((f) => f.level === 'warn');
    const ok = faults.filter((f) => f.level === 'ok');
    const allClear = crit.length === 0 && warn.length === 0;
    const stale = healthAgeMinutes === null || healthAgeMinutes > STALE_AFTER_MIN;

    return (
        <div
            className="ak-card"
            style={{
                ...JARVIS_VARS,
                background: 'linear-gradient(180deg, rgba(10, 16, 36, 0.92), rgba(6, 10, 24, 0.95))',
                border: '1px solid rgba(111, 178, 255, 0.16)',
                color: 'var(--ink)',
                minWidth: 0,
                overflowWrap: 'anywhere',
            }}
        >
            {/* Header */}
            <div style={{
                display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', marginBottom: 12,
            }}>
                <span className="ak-overline" style={{ color: 'var(--gold)' }}>Diagnostics</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span
                        title={stale
                            ? 'The health-monitor cron runs every 30 minutes. A snapshot this old means the cron itself needs looking at, so the levels below may be out of date.'
                            : undefined}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            color: stale ? 'var(--warn)' : 'var(--ink-3)',
                        }}
                    >
                        <Clock size={12} strokeWidth={2.4} />
                        {ageLabel(healthAgeMinutes)}
                    </span>
                    {onRecheck && (
                        <button
                            type="button"
                            onClick={onRecheck}
                            className="ak-btn ak-btn--ghost"
                            style={{ height: 28, padding: '0 10px', fontSize: '0.72rem', color: 'var(--blue)' }}
                        >
                            <RefreshCw size={12} strokeWidth={2.4} />
                            Re-check
                        </button>
                    )}
                </div>
            </div>

            {/* The stale-snapshot note. Shown instead of a re-check button, which
                cannot work from the browser without cron auth. */}
            {stale && (
                <div style={{
                    fontSize: '0.74rem', color: 'var(--ink-3)', marginBottom: 12,
                    padding: '8px 10px', borderRadius: 9,
                    background: 'rgba(255, 196, 107, 0.06)',
                    border: '1px solid rgba(255, 196, 107, 0.2)',
                }}>
                    {healthAgeMinutes === null
                        ? 'No health snapshot has been written yet. The health-monitor cron persists one every 30 minutes; error logs and stuck posts below are still live.'
                        : 'Health checks are older than one cron cycle — treat the levels below as last-known, not current.'}
                </div>
            )}

            {allClear ? (
                <div style={{
                    display: 'flex', gap: 12, alignItems: 'flex-start',
                    padding: '16px 14px', borderRadius: 12, minWidth: 0,
                    background: 'radial-gradient(120% 140% at 0% 0%, rgba(53, 200, 138, 0.09), transparent 70%), var(--surface)',
                    border: '1px solid rgba(53, 200, 138, 0.22)',
                }}>
                    <ShieldCheck size={20} strokeWidth={2} style={{ color: 'var(--ok)', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--ink)' }}>
                            All systems nominal
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--ink-2)', marginTop: 2 }}>
                            No critical faults and no warnings across health checks, error logs and the publish queue.
                        </div>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: 8, marginBottom: ok.length ? 12 : 0 }}>
                    <Group level="crit" faults={crit} defaultOpen onFocusNode={onFocusNode} />
                    <Group level="warn" faults={warn} defaultOpen onFocusNode={onFocusNode} />
                </div>
            )}

            {ok.length > 0 && (
                <div style={{ marginTop: allClear ? 12 : 0 }}>
                    <Group level="ok" faults={ok} defaultOpen={false} onFocusNode={onFocusNode} />
                </div>
            )}
        </div>
    );
}
