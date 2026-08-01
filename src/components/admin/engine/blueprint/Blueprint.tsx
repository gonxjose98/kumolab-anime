'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Radio, Loader2 } from 'lucide-react';
import { BLUEPRINT, NODES_BY_ID } from '@/lib/engine/blueprint';
import { layoutNodes, focusBox, focusSet, SCENE, R } from './layout';
import { buildEdgeGeom, type EdgeGeom } from './geometry';
import {
    EdgeLayer, ParticleLayer, PulseLayer, NodeLayer, Defs, RingGuides,
    type Pulse, type NodeState,
} from './Canvas';
import Inspector from './Inspector';
import type { BlueprintLiveState, WorkerRunLite } from './types';
import './jarvis.css';

/**
 * The blueprint scene.
 *
 * Owns exactly one animation loop for the entire canvas. That is a hard
 * constraint, not a style preference: "always alive" means something is moving
 * every frame forever, and one shared rAF that all layers read from is the
 * difference between ambient motion being free and it being a battery fire.
 * The loop stops when the tab is hidden, when the canvas scrolls out of view,
 * and when the user prefers reduced motion.
 *
 * Everything that moves is driven by real data. Nothing animates to imply
 * activity that did not happen — a pulse on an edge means a worker actually ran.
 */

const POLL_MS = 20_000;
const REPLAY_WINDOW_MS = 30 * 60 * 1000;  // replay this much history on load
const PULSE_MS = 1400;
const FRAME_MS = 33;                      // ~30fps is plenty for glowing dots

function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** How a worker's recent history reads as a node state. */
function stateForRuns(runs: WorkerRunLite[], now: number): NodeState {
    if (runs.length === 0) return 'unknown';
    const latest = runs[0];
    // Started and never finished, well past any plausible runtime. This is the
    // state that used to be invisible entirely.
    if (!latest.finished_at && now - new Date(latest.started_at).getTime() > 10 * 60_000) {
        return 'stalled';
    }
    if (latest.ok === false) return 'crit';
    return 'good';
}

export default function Blueprint({
    initial, onFocusRequest,
}: {
    initial: BlueprintLiveState;
    onFocusRequest?: (fn: (nodeId: string) => void) => void;
}) {
    const [live, setLive] = useState<BlueprintLiveState>(initial);
    const [focusId, setFocusId] = useState<string | null>(null);
    const [frame, setFrame] = useState(0);
    const [refreshing, setRefreshing] = useState(false);

    // The moving layers are strictly client-side. Their positions are a
    // function of the animation clock, so rendering them during SSR guarantees
    // a hydration mismatch — the server's t=0 frame can never match whatever
    // the client's clock reads a moment later. `dense` has the same problem for
    // a different reason: it reads window.innerWidth, which does not exist on
    // the server. Both wait for mount.
    const [mounted, setMounted] = useState(false);
    const [dense, setDense] = useState(true);

    useEffect(() => {
        setMounted(true);
        const measure = () => setDense(window.innerWidth > 720);
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    const hostRef = useRef<HTMLDivElement | null>(null);
    const pulsesRef = useRef<Pulse[]>([]);
    const seenRunIds = useRef<Set<string>>(new Set());
    const reduced = useRef(false);

    // ── Geometry (recomputed only if the graph itself changes) ──
    const placed = useMemo(() => layoutNodes(BLUEPRINT.nodes), []);
    const posById = useMemo(
        () => new Map(placed.map((p) => [p.node.id, p])),
        [placed],
    );
    const edges: EdgeGeom[] = useMemo(() => {
        const out: EdgeGeom[] = [];
        for (const e of BLUEPRINT.edges) {
            const a = posById.get(e.from);
            const b = posById.get(e.to);
            if (a && b) out.push(buildEdgeGeom(`${e.from}->${e.to}`, e.from, e.to, a.x, a.y, b.x, b.y));
        }
        return out;
    }, [posById]);
    const edgeIndex = useMemo(() => new Map(edges.map((e) => [e.key, e])), [edges]);
    const edgesByFrom = useMemo(() => {
        const m = new Map<string, EdgeGeom[]>();
        for (const e of edges) {
            const arr = m.get(e.from);
            if (arr) arr.push(e); else m.set(e.from, [e]);
        }
        return m;
    }, [edges]);

    // ── Node state from live data ──
    const nodeStates = useMemo(() => {
        const now = Date.now();
        const byWorker = new Map<string, WorkerRunLite[]>();
        for (const r of live.runs) {
            const arr = byWorker.get(r.worker);
            if (arr) arr.push(r); else byWorker.set(r.worker, [r]);
        }
        const health = new Map(live.health.checks.map((c) => [c.key, c.level]));

        const states = new Map<string, NodeState>();
        for (const p of placed) {
            const n = p.node;
            let s: NodeState = 'idle';
            if (n.worker) s = stateForRuns(byWorker.get(n.worker) ?? [], now);
            if (n.healthKey) {
                const lvl = health.get(n.healthKey);
                // Health outranks run history: a worker can complete "fine" and
                // still be feeding a broken subsystem.
                if (lvl === 'crit') s = 'crit';
                else if (lvl === 'warn' && s !== 'crit' && s !== 'stalled') s = 'warn';
                else if (lvl === 'ok' && s === 'idle') s = 'good';
            }
            if (n.kind === 'core') {
                // With no health snapshot yet, the honest answer is "unknown".
                // Showing a confident green because zero checks failed would be
                // the exact silent-decay failure this page exists to prevent.
                s = live.health.checks.length === 0
                    ? 'unknown'
                    : live.health.checks.some((c) => c.level === 'crit')
                        ? 'crit'
                        : live.health.checks.some((c) => c.level === 'warn') ? 'warn' : 'good';
            }
            states.set(n.id, s);
        }
        return states;
    }, [live, placed]);

    const agentNodeIds = useMemo(
        () => new Set(live.agents.map((a) => a.node_id).filter(Boolean) as string[]),
        [live.agents],
    );

    /**
     * Nodes that ran in the last 10 minutes. They emit a radar ping, so a
     * glance at the map tells you what is warm right now — distinct from the
     * node colour, which only says whether the last run passed.
     *
     * Gated on `mounted` because the window is measured from Date.now().
     */
    const pingIds = useMemo(() => {
        if (!mounted) return new Set<string>();
        const cutoff = Date.now() - 10 * 60_000;
        const workers = new Set(
            live.runs.filter((r) => new Date(r.started_at).getTime() >= cutoff).map((r) => r.worker),
        );
        return new Set(
            placed.filter((p) => p.node.worker && workers.has(p.node.worker)).map((p) => p.node.id),
        );
    }, [live.runs, placed, mounted]);

    // ── Turn new runs into travelling light ──
    const emitPulses = useCallback((runs: WorkerRunLite[], replay: boolean) => {
        const now = performance.now();
        const cutoff = Date.now() - REPLAY_WINDOW_MS;
        const fresh = runs.filter((r) => {
            if (seenRunIds.current.has(r.id)) return false;
            if (replay && new Date(r.started_at).getTime() < cutoff) return false;
            return true;
        });
        for (const r of fresh) seenRunIds.current.add(r.id);
        if (reduced.current) return; // state still updates; only the motion is dropped

        const added: Pulse[] = [];
        fresh.forEach((r, i) => {
            const node = BLUEPRINT.nodes.find((n) => n.worker === r.worker);
            if (!node) return;
            const outs = edgesByFrom.get(node.id) ?? [];
            for (const e of outs) {
                added.push({
                    id: `${r.id}-${e.key}`,
                    edgeKey: e.key,
                    // Stagger replayed history so 30 minutes of runs arrive as a
                    // cascade rather than one indecipherable flash.
                    start: now + (replay ? i * 180 : 0),
                    duration: PULSE_MS,
                    ok: r.ok !== false,
                });
            }
        });
        if (added.length) {
            // Hard cap: a long replay must never queue thousands of packets.
            pulsesRef.current = [...pulsesRef.current, ...added].slice(-240);
        }
    }, [edgesByFrom]);

    // ── The single animation loop ──
    useEffect(() => {
        reduced.current = prefersReducedMotion();
        emitPulses(initial.runs, true);

        let raf = 0;
        let last = 0;
        let running = true;

        const tick = (t: number) => {
            if (!running) return;
            if (t - last >= FRAME_MS) {
                last = t;
                // Drop finished packets so the array can't grow without bound.
                if (pulsesRef.current.length) {
                    pulsesRef.current = pulsesRef.current.filter((p) => t - p.start <= p.duration);
                }
                setFrame(t);
            }
            raf = requestAnimationFrame(tick);
        };

        const start = () => {
            if (raf || !running) return;
            last = 0;
            raf = requestAnimationFrame(tick);
        };
        const stop = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
        };

        // Reduced motion still renders the scene, it just doesn't animate it.
        if (!reduced.current) start();

        const onVisibility = () => {
            if (document.hidden) stop();
            else if (!reduced.current) start();
        };
        document.addEventListener('visibilitychange', onVisibility);

        // Off-screen canvas costs nothing.
        let io: IntersectionObserver | null = null;
        if (hostRef.current && typeof IntersectionObserver !== 'undefined') {
            io = new IntersectionObserver(([entry]) => {
                if (entry.isIntersecting && !document.hidden && !reduced.current) start();
                else stop();
            }, { threshold: 0.01 });
            io.observe(hostRef.current);
        }

        return () => {
            running = false;
            stop();
            document.removeEventListener('visibilitychange', onVisibility);
            io?.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Polling ──
    useEffect(() => {
        let cancelled = false;
        const pull = async () => {
            if (document.hidden) return;
            setRefreshing(true);
            try {
                const res = await fetch('/api/admin/engine/state', { cache: 'no-store' });
                if (!res.ok) return;
                const data = await res.json();
                if (cancelled || !data?.runs) return;
                setLive({
                    generatedAt: data.generatedAt,
                    runs: data.runs,
                    health: data.health,
                    agents: data.agents ?? [],
                });
                emitPulses(data.runs, false);
            } catch {
                // Keep the last good state. A blank canvas would read as "the
                // system is down" when only this fetch failed.
            } finally {
                if (!cancelled) setRefreshing(false);
            }
        };
        const id = setInterval(pull, POLL_MS);
        return () => { cancelled = true; clearInterval(id); };
    }, [emitPulses]);

    // ── Camera ──
    // The inspector is a right-hand drawer on desktop and a bottom sheet on a
    // phone, so it only steals horizontal space on the wide layout.
    const rightCover = focusId && dense ? 0.34 : 0;
    const targetBox = useMemo(
        () => focusBox(placed, focusId, rightCover),
        [placed, focusId, rightCover],
    );
    const [viewBox, setViewBox] = useState<[number, number, number, number]>(targetBox);
    const camRef = useRef({ from: targetBox, to: targetBox, start: 0 });

    useEffect(() => {
        camRef.current = { from: viewBox, to: targetBox, start: performance.now() };
        let raf = 0;
        const DUR = reduced.current ? 0 : 420;
        const ease = (t: number) => 1 - Math.pow(1 - t, 3);
        const step = (t: number) => {
            const { from, to, start } = camRef.current;
            const k = DUR === 0 ? 1 : Math.min(1, (t - start) / DUR);
            const e = ease(k);
            setViewBox([
                from[0] + (to[0] - from[0]) * e,
                from[1] + (to[1] - from[1]) * e,
                from[2] + (to[2] - from[2]) * e,
                from[3] + (to[3] - from[3]) * e,
            ]);
            if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetBox]);

    const lit = useMemo(() => focusSet(placed, focusId), [placed, focusId]);
    const focusNode = focusId ? NODES_BY_ID[focusId] : null;

    // Let the parent (e.g. a fault row) drive focus.
    useEffect(() => {
        onFocusRequest?.((id: string) => { if (NODES_BY_ID[id]) setFocusId(id); });
    }, [onFocusRequest]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFocusId(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const liveAgents = live.agents.filter(
        (a) => Date.now() - new Date(a.updated_at).getTime() < 5 * 60_000,
    );

    return (
        <div className="jarvis" ref={hostRef} style={{ position: 'relative' }}>
            {/* HUD */}
            <div className="jarvis__hud jarvis__hud--tl">
                {focusNode ? (
                    <button className="jarvis__chip" onClick={() => setFocusId(null)}>
                        <ChevronLeft size={12} /> Overview
                    </button>
                ) : (
                    <span className="jarvis__chip" style={{ cursor: 'default' }}>
                        <Radio size={12} style={{ color: 'var(--gold)' }} />
                        {BLUEPRINT.nodes.length} nodes · {BLUEPRINT.edges.length} links
                    </span>
                )}
            </div>

            <div className="jarvis__hud jarvis__hud--tr">
                {refreshing && (
                    <span className="jarvis__chip" style={{ cursor: 'default' }}>
                        <Loader2 size={12} className="ak-spin" /> Syncing
                    </span>
                )}
                {/* Also gated on mount: the freshness window is measured from
                    Date.now(), which differs between server and client. */}
                {mounted && liveAgents.length > 0 && (
                    <span className="jarvis__chip" style={{ cursor: 'default', borderColor: 'rgba(111,178,255,0.5)' }}>
                        <span style={{
                            width: 6, height: 6, borderRadius: 999, background: 'var(--blue)',
                            display: 'inline-block',
                        }} />
                        {liveAgents.length} agent{liveAgents.length === 1 ? '' : 's'} working
                    </span>
                )}
            </div>

            <div className="jarvis__hud jarvis__hud--bl">
                <span className="jarvis__chip" style={{ cursor: 'default', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>
                    {live.runs.length === 0
                        ? 'No worker runs recorded yet — telemetry starts at the next cron tick'
                        : `${live.runs.length} worker run${live.runs.length === 1 ? '' : 's'} in the last 24h`}
                </span>
            </div>

            <svg
                className="jarvis__stage"
                viewBox={viewBox.join(' ')}
                width="100%"
                style={{ aspectRatio: `${SCENE.w} / ${SCENE.h}`, maxHeight: '78vh' }}
                role="img"
                aria-label="KumoLab system blueprint. Interactive node map of sources, workers and destinations."
            >
                <Defs />
                <RingGuides
                    radii={[R.stage, R.worker, R.edge, R.outer]}
                    cx={SCENE.cx}
                    cy={SCENE.cy}
                    dim={!!focusId}
                />
                <EdgeLayer edges={edges} litIds={lit} hasFocus={!!focusId} />
                {mounted && <ParticleLayer edges={edges} t={frame} dense={dense} />}
                {mounted && <PulseLayer pulses={pulsesRef.current} edgeIndex={edgeIndex} t={frame} />}
                <NodeLayer
                    placed={placed}
                    states={nodeStates}
                    litIds={lit}
                    hasFocus={!!focusId}
                    focusId={focusId}
                    onFocus={setFocusId}
                    agentNodeIds={agentNodeIds}
                    pingIds={pingIds}
                />
            </svg>

            {focusNode && (
                <Inspector
                    node={focusNode}
                    runs={live.runs}
                    onClose={() => setFocusId(null)}
                />
            )}
        </div>
    );
}
