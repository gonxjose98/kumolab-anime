'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Network, ListChecks, Target, Clock, Activity, AlertTriangle, Layers,
    ChevronDown, ChevronRight,
} from 'lucide-react';
import { BLUEPRINT, type BlueprintNode, type NodeKind } from '@/lib/engine/blueprint';
import type { FormulaElement } from '@/lib/engine/engine-config';

/**
 * BriefDialog — the reference popup.
 *
 * Three read-only sections, written to be read at 2am by someone (or something)
 * that has just arrived and needs to orient itself:
 *
 *   1. ARCHITECTURE — GENERATED from `BLUEPRINT`. Every node, grouped by ring,
 *      with its cadence, its health check, its error sources and its `doc`
 *      paragraph. Generated rather than written, so it cannot drift from the
 *      map the canvas renders or from the graph an agent reads over the API. A
 *      hand-maintained architecture doc that disagrees with the code is worse
 *      than none, because an agent will trust it.
 *   2. FORMULA — the posting rules, passed in from `post_formula`.
 *   3. GOALS — the KumoLab project goals, passed in.
 *
 * Nothing here is editable: both data rows are edited in the database without a
 * deploy, and a UI editor is deliberately out of scope.
 *
 * ALWAYS DARK, palette pinned to the `jarvis.css` night values so the dialog
 * matches the console it opens from regardless of the admin theme toggle.
 */

const JARVIS_VARS = {
    '--gold': '#e6c489',
    '--blue': '#6fb2ff',
    '--ok': '#35c88a',
    '--sun': '#ff7a6b',
    '--ink': '#f2f9ff',
    '--ink-2': 'rgba(226, 240, 255, 0.72)',
    '--ink-3': 'rgba(200, 220, 245, 0.42)',
    '--line': 'rgba(226, 176, 90, 0.26)',
    '--surface': 'rgba(12, 18, 44, 0.62)',
    '--surface-2': 'rgba(18, 26, 56, 0.72)',
} as React.CSSProperties;

type TabKey = 'architecture' | 'formula' | 'goals';

const TABS: { key: TabKey; label: string; icon: typeof Network }[] = [
    { key: 'architecture', label: 'Architecture', icon: Network },
    { key: 'formula', label: 'Formula', icon: ListChecks },
    { key: 'goals', label: 'Goals', icon: Target },
];

const RINGS: { ring: 0 | 1 | 2 | 3; title: string; blurb: string }[] = [
    { ring: 0, title: 'Core', blurb: 'The loop everything else hangs off.' },
    { ring: 1, title: 'Pipeline', blurb: 'Cron-driven workers and the stages they move content through.' },
    { ring: 2, title: 'Sources & destinations', blurb: 'Where content comes from, and where finished posts land.' },
    { ring: 3, title: 'External dependencies', blurb: 'Third-party APIs and stores. Each one is a way the system can stop.' },
];

const KIND_ORDER: NodeKind[] = ['core', 'worker', 'stage', 'store', 'surface', 'source', 'external'];

const KIND_LABEL: Record<NodeKind, string> = {
    core: 'Core',
    worker: 'Workers',
    stage: 'Stages',
    store: 'Data stores',
    surface: 'Publishing surfaces',
    source: 'Content sources',
    external: 'Third parties',
};

/** Kind groups big enough that opening them all would bury everything else. */
const COLLAPSED_BY_DEFAULT = new Set<NodeKind>(['source']);

function Meta({ icon: Icon, children }: { icon: typeof Clock; children: React.ReactNode }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: '0.68rem', fontWeight: 700, color: 'var(--ink-3)',
            overflowWrap: 'anywhere',
        }}>
            <Icon size={11} strokeWidth={2.4} style={{ flexShrink: 0 }} />
            {children}
        </span>
    );
}

function NodeCard({ node }: { node: BlueprintNode }) {
    return (
        <div style={{
            padding: '10px 12px', borderRadius: 10, minWidth: 0,
            background: 'var(--surface)',
            border: '1px solid rgba(111, 178, 255, 0.13)',
        }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--ink)', overflowWrap: 'anywhere' }}>
                    {node.label}
                </span>
                <code style={{
                    fontSize: '0.64rem', color: 'var(--ink-3)', overflowWrap: 'anywhere',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}>{node.id}</code>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 5 }}>
                {node.cadence && <Meta icon={Clock}>{node.cadence}</Meta>}
                {node.schedule && !node.cadence && <Meta icon={Clock}>{node.schedule}</Meta>}
                {node.tier && <Meta icon={Layers}>tier {node.tier}</Meta>}
                {node.healthKey && <Meta icon={Activity}>health: {node.healthKey}</Meta>}
                {node.env && <Meta icon={Layers}>{node.env}</Meta>}
                {node.errorSources?.length ? (
                    <Meta icon={AlertTriangle}>{node.errorSources.join(', ')}</Meta>
                ) : null}
            </div>

            <p style={{
                fontSize: '0.79rem', lineHeight: 1.55, color: 'var(--ink-2)',
                margin: '8px 0 0', overflowWrap: 'anywhere',
            }}>{node.doc}</p>
        </div>
    );
}

function KindGroup({ kind, nodes }: { kind: NodeKind; nodes: BlueprintNode[] }) {
    const [open, setOpen] = useState(!COLLAPSED_BY_DEFAULT.has(kind));
    return (
        <div style={{ minWidth: 0 }}>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                style={{
                    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                    background: 'transparent', border: 'none', padding: '4px 0',
                    cursor: 'pointer', textAlign: 'left', color: 'var(--ink-2)',
                }}
            >
                {open
                    ? <ChevronDown size={13} strokeWidth={2.4} style={{ flexShrink: 0 }} />
                    : <ChevronRight size={13} strokeWidth={2.4} style={{ flexShrink: 0 }} />}
                <span style={{
                    fontSize: '0.64rem', fontWeight: 800, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: 'var(--blue)',
                }}>{KIND_LABEL[kind]}</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--ink-3)' }}>
                    {nodes.length}
                </span>
            </button>
            {open && (
                <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                    {nodes.map((n) => <NodeCard key={n.id} node={n} />)}
                </div>
            )}
        </div>
    );
}

function Architecture() {
    // Grouped once. BLUEPRINT is a module constant, so this never recomputes.
    const byRing = useMemo(() => {
        const map = new Map<number, Map<NodeKind, BlueprintNode[]>>();
        for (const n of BLUEPRINT.nodes) {
            if (!map.has(n.ring)) map.set(n.ring, new Map());
            const kinds = map.get(n.ring)!;
            if (!kinds.has(n.kind)) kinds.set(n.kind, []);
            kinds.get(n.kind)!.push(n);
        }
        return map;
    }, []);

    return (
        <div style={{ display: 'grid', gap: 22, minWidth: 0 }}>
            <p style={{ fontSize: '0.8rem', lineHeight: 1.6, color: 'var(--ink-2)', margin: 0 }}>
                Generated from <code style={{ color: 'var(--gold)' }}>blueprint.ts</code>, the same graph the
                canvas draws and the state API serves. {BLUEPRINT.nodes.length} nodes,{' '}
                {BLUEPRINT.edges.length} edges. Because it is generated it cannot disagree with the map.
            </p>

            {RINGS.map(({ ring, title, blurb }) => {
                const kinds = byRing.get(ring);
                if (!kinds || kinds.size === 0) return null;
                return (
                    <section key={ring} style={{ minWidth: 0 }}>
                        <h3 style={{
                            fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.12em',
                            textTransform: 'uppercase', color: 'var(--gold)', margin: '0 0 2px',
                        }}>{title}</h3>
                        <p style={{ fontSize: '0.74rem', color: 'var(--ink-3)', margin: '0 0 10px' }}>{blurb}</p>
                        <div style={{ display: 'grid', gap: 12 }}>
                            {KIND_ORDER.filter((k) => kinds.has(k)).map((k) => (
                                <KindGroup key={k} kind={k} nodes={kinds.get(k)!} />
                            ))}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}

function NumberedList({ items, accent }: { items: { title: string; detail: string }[]; accent: string }) {
    if (items.length === 0) {
        return <p style={{ fontSize: '0.8rem', color: 'var(--ink-3)', margin: 0 }}>Nothing recorded yet.</p>;
    }
    return (
        <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
            {items.map((it, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0 }}>
                    <span style={{
                        flexShrink: 0, width: 24, height: 24, borderRadius: 7,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--surface-2)', border: `1px solid ${accent}44`,
                        fontWeight: 800, fontSize: '0.78rem', color: accent,
                    }}>{i + 1}</span>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--ink)', overflowWrap: 'anywhere' }}>
                            {it.title}
                        </div>
                        <div style={{
                            fontSize: '0.79rem', lineHeight: 1.55, color: 'var(--ink-2)',
                            marginTop: 2, overflowWrap: 'anywhere',
                        }}>{it.detail}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function BriefDialog({
    formula,
    goals,
    onClose,
}: {
    formula: FormulaElement[];
    goals: { title: string; detail: string }[];
    onClose: () => void;
}) {
    const [tab, setTab] = useState<TabKey>('architecture');
    const [mounted, setMounted] = useState(false);
    const bodyRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);

    useEffect(() => setMounted(true), []);

    // ESC closes, and the page behind must not scroll while the sheet is up.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus();
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [onClose]);

    // Switching tabs returns you to the top of the panel; otherwise you land
    // mid-way down a document you have not read.
    useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [tab]);

    if (!mounted) return null;

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label="KumoLab engine brief"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
            style={{
                ...JARVIS_VARS,
                position: 'fixed', inset: 0, zIndex: 9000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 'max(12px, env(safe-area-inset-top)) 12px 12px',
                background: 'rgba(3, 6, 14, 0.72)',
                backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
                color: 'var(--ink)',
            }}
        >
            <div style={{
                width: 'min(760px, 100%)', maxHeight: '92dvh', minWidth: 0,
                display: 'flex', flexDirection: 'column',
                borderRadius: 16, overflow: 'hidden',
                background: 'linear-gradient(180deg, rgba(10, 16, 36, 0.98), rgba(6, 10, 24, 0.99))',
                border: '1px solid rgba(111, 178, 255, 0.2)',
                boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6)',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 10, padding: '14px 14px 10px', borderBottom: '1px solid rgba(111, 178, 255, 0.14)',
                }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{
                            fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.14em',
                            textTransform: 'uppercase', color: 'var(--gold)',
                        }}>KumoLab brief</div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--ink-3)', marginTop: 1 }}>
                            Reference only. Nothing here is editable.
                        </div>
                    </div>
                    <button
                        ref={closeRef}
                        type="button"
                        onClick={onClose}
                        aria-label="Close brief"
                        style={{
                            flexShrink: 0, width: 32, height: 32, borderRadius: 9,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'var(--surface-2)', color: 'var(--ink-2)',
                            border: '1px solid rgba(111, 178, 255, 0.18)', cursor: 'pointer',
                        }}
                    >
                        <X size={16} strokeWidth={2.4} />
                    </button>
                </div>

                {/* Tabs. Horizontally scrollable rather than wrapped, so the row
                    keeps its shape at 360px without pushing the dialog wide. */}
                <div
                    role="tablist"
                    aria-label="Brief sections"
                    style={{
                        display: 'flex', gap: 6, padding: '10px 14px',
                        overflowX: 'auto', scrollbarWidth: 'none',
                        borderBottom: '1px solid rgba(111, 178, 255, 0.1)',
                    }}
                >
                    {TABS.map(({ key, label, icon: Icon }) => {
                        const active = tab === key;
                        return (
                            <button
                                key={key}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                onClick={() => setTab(key)}
                                style={{
                                    flexShrink: 0,
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
                                    fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.04em',
                                    textTransform: 'uppercase', whiteSpace: 'nowrap',
                                    color: active ? '#0a1020' : 'var(--ink-2)',
                                    background: active ? 'var(--gold)' : 'transparent',
                                    border: `1px solid ${active ? 'var(--gold)' : 'rgba(111, 178, 255, 0.2)'}`,
                                }}
                            >
                                <Icon size={13} strokeWidth={2.4} />
                                {label}
                            </button>
                        );
                    })}
                </div>

                {/* Body */}
                <div
                    ref={bodyRef}
                    style={{
                        padding: '16px 14px 24px', overflowY: 'auto', overscrollBehavior: 'contain',
                        minWidth: 0, flex: 1,
                    }}
                >
                    {tab === 'architecture' && <Architecture />}

                    {tab === 'formula' && (
                        <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
                            <p style={{ fontSize: '0.8rem', lineHeight: 1.6, color: 'var(--ink-2)', margin: 0 }}>
                                The rules a winning post follows. Any agent acting on KumoLab should check its
                                work against these before publishing.
                            </p>
                            <NumberedList items={formula} accent="var(--gold)" />
                        </div>
                    )}

                    {tab === 'goals' && (
                        <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
                            <p style={{ fontSize: '0.8rem', lineHeight: 1.6, color: 'var(--ink-2)', margin: 0 }}>
                                KumoLab project goals, distinct from the APEX global goals. What the pipeline is
                                actually for.
                            </p>
                            <NumberedList items={goals} accent="var(--blue)" />
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body,
    );
}
