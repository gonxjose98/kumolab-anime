'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, BookOpen } from 'lucide-react';
import type { FormulaElement, PeakSlot, ScheduledItem } from '@/lib/engine/engine-config';
import type { AnimeTier } from '@/lib/engine/anime-tiers';
import type { Fault } from '@/lib/engine/faults';
import type { BlueprintLiveState } from './blueprint/types';
import Blueprint from './blueprint/Blueprint';
import Faults from './Faults';
import BriefDialog from './BriefDialog';
import EngineTiers from './EngineTiers';
import Clock from './clock/Clock';

/**
 * The Engine tab shell.
 *
 * Layout follows the one rule Jose set: everything is visible, or one click
 * from visible. The blueprint owns the first screen; schedule, diagnostics and
 * tiers are full-width collapsible sections beneath it that remember whether
 * they were open. Nothing is deleted, only collapsed — the posting formula moves
 * into the brief popup because it is reference material, not a control.
 */

const STORAGE_KEY = 'kumolab.engine.sections';

type SectionId = 'schedule' | 'diagnostics' | 'tiers';

const DEFAULT_OPEN: Record<SectionId, boolean> = {
    schedule: true,
    diagnostics: true,
    tiers: false,
};

function Section({
    id, title, subtitle, accent, open, onToggle, children, badge,
}: {
    id: SectionId;
    title: string;
    subtitle: string;
    accent: string;
    open: boolean;
    onToggle: (id: SectionId) => void;
    children: React.ReactNode;
    badge?: React.ReactNode;
}) {
    return (
        <section className="ak-card ak-card--flush" style={{ overflow: 'hidden' }}>
            <button
                onClick={() => onToggle(id)}
                aria-expanded={open}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '14px 16px', background: 'none', border: 'none',
                    cursor: 'pointer', textAlign: 'left', color: 'inherit',
                }}
            >
                <ChevronDown
                    size={16}
                    style={{
                        flexShrink: 0, color: 'var(--ink-3)',
                        transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
                        transition: 'transform 200ms ease',
                    }}
                />
                <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="ak-overline" style={{ color: accent, display: 'block' }}>{title}</span>
                    <span className="ak-caption" style={{ display: 'block', marginTop: 2 }}>{subtitle}</span>
                </span>
                {badge}
            </button>
            {open && <div style={{ padding: '0 16px 16px' }}>{children}</div>}
        </section>
    );
}

export default function EngineShell({
    live, faults, healthAgeMinutes, slots, queue, tiers, formula, goals,
}: {
    live: BlueprintLiveState;
    faults: Fault[];
    healthAgeMinutes: number | null;
    slots: PeakSlot[];
    queue: ScheduledItem[];
    tiers: AnimeTier[];
    formula: FormulaElement[];
    goals: FormulaElement[];
}) {
    const [open, setOpen] = useState<Record<SectionId, boolean>>(DEFAULT_OPEN);
    const [briefOpen, setBriefOpen] = useState(false);
    const focusFn = useRef<((id: string) => void) | null>(null);

    // Restore after mount, never during render — reading localStorage on the
    // server would desync hydration.
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) setOpen({ ...DEFAULT_OPEN, ...JSON.parse(raw) });
        } catch { /* a corrupt preference is not worth failing the page over */ }
    }, []);

    const toggle = useCallback((id: SectionId) => {
        setOpen((prev) => {
            const next = { ...prev, [id]: !prev[id] };
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
            return next;
        });
    }, []);

    const registerFocus = useCallback((fn: (id: string) => void) => {
        focusFn.current = fn;
    }, []);

    // Clicking a fault focuses the node that produced it, then scrolls the
    // canvas back into view — the whole point of resolving faults to nodes.
    const focusNode = useCallback((nodeId: string) => {
        focusFn.current?.(nodeId);
        document.getElementById('engine-canvas')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, []);

    const crits = faults.filter((f) => f.level === 'crit').length;
    const warns = faults.filter((f) => f.level === 'warn').length;

    return (
        <div className="flex flex-col gap-4 min-w-0">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <p className="ak-caption" style={{ margin: 0, maxWidth: '60ch' }}>
                    The live system. Every source, worker, API and destination, animated by real
                    telemetry. Tap any node to open it.
                </p>
                <button className="ak-btn ak-btn--secondary ak-btn--sm" onClick={() => setBriefOpen(true)}>
                    <BookOpen size={13} /> Brief
                </button>
            </div>

            <div id="engine-canvas">
                <Blueprint initial={live} onFocusRequest={registerFocus} />
            </div>

            <Section
                id="schedule"
                title="Schedule"
                subtitle="The 24-hour dial. Drag a post to move it; slot times are editable."
                accent="var(--gold)"
                open={open.schedule}
                onToggle={toggle}
            >
                <Clock initialSlots={slots} initialQueue={queue} />
            </Section>

            <Section
                id="diagnostics"
                title="Diagnostics"
                subtitle="Health checks, recent errors and stuck posts, resolved to the part of the system that produced them."
                accent={crits ? 'var(--sun)' : warns ? 'var(--gold)' : 'var(--ok)'}
                open={open.diagnostics}
                onToggle={toggle}
                badge={
                    (crits || warns) ? (
                        <span className="ak-caption" style={{ flexShrink: 0, fontWeight: 700, color: crits ? 'var(--sun)' : 'var(--gold)' }}>
                            {crits ? `${crits} critical` : `${warns} warning${warns === 1 ? '' : 's'}`}
                        </span>
                    ) : (
                        <span className="ak-caption" style={{ flexShrink: 0, color: 'var(--ok)', fontWeight: 700 }}>All clear</span>
                    )
                }
            >
                <Faults faults={faults} healthAgeMinutes={healthAgeMinutes} onFocusNode={focusNode} />
            </Section>

            <Section
                id="tiers"
                title="Priority tiers"
                subtitle="The curated list driving 40 of the 100 score points. Editable."
                accent="var(--blue)"
                open={open.tiers}
                onToggle={toggle}
                badge={<span className="ak-caption" style={{ flexShrink: 0 }}>{tiers.length} anime</span>}
            >
                <EngineTiers initialTiers={tiers} />
            </Section>

            {briefOpen && (
                <BriefDialog formula={formula} goals={goals} onClose={() => setBriefOpen(false)} />
            )}
        </div>
    );
}
