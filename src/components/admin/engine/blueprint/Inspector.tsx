'use client';

import { X, ExternalLink } from 'lucide-react';
import type { BlueprintNode } from '@/lib/engine/blueprint';
import type { WorkerRunLite } from './types';

/**
 * The drill-down panel. A side drawer on desktop, a bottom sheet on a phone
 * (see jarvis.css).
 *
 * Its job is to answer, for whatever was clicked: what is this, when did it
 * last run, what did it produce, and how does it fail? The last one is the
 * reason `doc` is written for an AI agent rather than as a UI tooltip — an
 * agent landing on this system cold should be able to read a node and know
 * what breaking looks like.
 */

const KIND_LABEL: Record<BlueprintNode['kind'], string> = {
    core: 'Core',
    stage: 'Pipeline stage',
    worker: 'Scheduled worker',
    source: 'Content source',
    external: 'Third-party service',
    store: 'Data store',
    surface: 'Publishing destination',
};

function ago(iso: string | null | undefined): string {
    if (!iso) return 'never';
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

function fmtDuration(ms: number | null | undefined): string {
    if (ms == null) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

export default function Inspector({
    node, runs, onClose,
}: {
    node: BlueprintNode;
    runs: WorkerRunLite[];
    onClose: () => void;
}) {
    const mine = node.worker ? runs.filter((r) => r.worker === node.worker).slice(0, 8) : [];

    return (
        <aside className="jarvis__inspector" aria-label={`${node.label} details`}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                <div style={{ minWidth: 0 }}>
                    <div style={{
                        fontSize: '0.64rem', fontWeight: 800, letterSpacing: '0.1em',
                        textTransform: 'uppercase', color: 'var(--blue)', marginBottom: 3,
                    }}>
                        {KIND_LABEL[node.kind]}
                    </div>
                    <h2 style={{
                        margin: 0, fontFamily: 'var(--ak-display)', fontWeight: 800,
                        fontSize: '1.18rem', color: 'var(--ink)', lineHeight: 1.2,
                    }}>
                        {node.label}
                    </h2>
                </div>
                <button
                    onClick={onClose}
                    aria-label="Close"
                    style={{
                        flexShrink: 0, background: 'none', border: '1px solid var(--line)',
                        borderRadius: 8, width: 30, height: 30, color: 'var(--ink-2)',
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >
                    <X size={15} />
                </button>
            </div>

            <dl className="jarvis__kv" style={{ marginBottom: 14 }}>
                {node.cadence && (<><dt>Runs</dt><dd>{node.cadence}</dd></>)}
                {node.schedule && (<><dt>Cron</dt><dd style={{ fontFamily: 'monospace', fontSize: '0.74rem' }}>{node.schedule}</dd></>)}
                {node.tier && (<><dt>Tier</dt><dd>T{node.tier}</dd></>)}
                {node.env && (<><dt>Env</dt><dd style={{ fontFamily: 'monospace', fontSize: '0.74rem' }}>{node.env}</dd></>)}
                {node.healthKey && (<><dt>Health</dt><dd>{node.healthKey}</dd></>)}
                <dt>Node ID</dt><dd style={{ fontFamily: 'monospace', fontSize: '0.74rem' }}>{node.id}</dd>
            </dl>

            <p style={{
                margin: '0 0 16px', fontSize: '0.84rem', lineHeight: 1.55,
                color: 'var(--ink-2)',
            }}>
                {node.doc}
            </p>

            {node.worker && (
                <>
                    <div style={{
                        fontSize: '0.64rem', fontWeight: 800, letterSpacing: '0.1em',
                        textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 8,
                    }}>
                        Recent runs
                    </div>
                    {mine.length === 0 ? (
                        <div style={{ fontSize: '0.8rem', color: 'var(--ink-3)', lineHeight: 1.5 }}>
                            No runs recorded yet. Telemetry begins at the worker&rsquo;s next tick
                            {node.cadence ? ` (${node.cadence.toLowerCase()})` : ''}.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                            {mine.map((r) => {
                                const stalled = !r.finished_at;
                                const colour = stalled ? 'var(--j-warn)' : r.ok ? 'var(--ok)' : 'var(--sun)';
                                return (
                                    <div key={r.id} style={{
                                        border: '1px solid var(--line)', borderRadius: 9,
                                        padding: '7px 9px', background: 'var(--surface)',
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: colour }}>
                                                {stalled ? 'Started, no result' : r.ok ? 'OK' : 'Failed'}
                                            </span>
                                            <span style={{ fontSize: '0.72rem', color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>
                                                {ago(r.started_at)} · {fmtDuration(r.duration_ms)}
                                            </span>
                                        </div>
                                        {r.error && (
                                            <div style={{ fontSize: '0.74rem', color: 'var(--sun)', marginTop: 3, overflowWrap: 'anywhere' }}>
                                                {r.error.slice(0, 200)}
                                            </div>
                                        )}
                                        {r.result && Object.keys(r.result).length > 0 && (
                                            <div style={{ fontSize: '0.73rem', color: 'var(--ink-3)', marginTop: 3, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>
                                                {Object.entries(r.result)
                                                    .filter(([, v]) => v !== null && typeof v !== 'object')
                                                    .slice(0, 6)
                                                    .map(([k, v]) => `${k}: ${v}`)
                                                    .join('  ·  ')}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {node.feeds.length > 0 && (
                <div style={{ marginTop: 16 }}>
                    <div style={{
                        fontSize: '0.64rem', fontWeight: 800, letterSpacing: '0.1em',
                        textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6,
                    }}>
                        Feeds into
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {node.feeds.map((f) => (
                            <span key={f} style={{
                                fontSize: '0.72rem', padding: '3px 7px', borderRadius: 6,
                                border: '1px solid var(--line)', color: 'var(--ink-2)',
                                fontFamily: 'monospace',
                            }}>
                                {f}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {node.errorSources && node.errorSources.length > 0 && (
                <div style={{ marginTop: 14 }}>
                    <div style={{
                        fontSize: '0.64rem', fontWeight: 800, letterSpacing: '0.1em',
                        textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: 6,
                    }}>
                        Logs errors as
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--ink-3)', fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
                        {node.errorSources.join(', ')}
                    </div>
                </div>
            )}

            {node.kind === 'source' && (
                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 5, color: 'var(--ink-3)', fontSize: '0.74rem' }}>
                    <ExternalLink size={12} />
                    Polled by the detection worker
                </div>
            )}
        </aside>
    );
}
