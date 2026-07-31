/**
 * worker-runs.ts — per-run cron telemetry.
 *
 * Before this, nothing recorded that a worker ran. `logSchedulerRun` covers 4 of
 * the 15 workers and carries neither a duration nor a structured payload, so
 * there was no row anywhere saying "processing ran at 14:00, took 9 seconds and
 * accepted 3 candidates". `worker_runs` covers every worker uniformly and is
 * what the blueprint canvas animates from.
 *
 * Two properties are deliberate and easy to break:
 *
 *   1. The row is inserted BEFORE the worker runs. A worker that crashes or
 *      times out therefore still leaves evidence: a row with
 *      `finished_at IS NULL` is itself a diagnosable state ("detection started
 *      40 minutes ago and never finished") and the canvas renders it as a
 *      stalled node. Insert-after would leave nothing at all for exactly the
 *      failures worth seeing.
 *
 *   2. Telemetry NEVER breaks a worker. Every Supabase call here is wrapped and
 *      its failure is warned and swallowed — including the initial insert, after
 *      which `fn` still runs. The one thing never swallowed is the worker's own
 *      error, which is re-thrown so the caller's error handling is unchanged.
 *
 * Server-only: imports supabaseAdmin, which throws at module load without
 * SUPABASE_SERVICE_ROLE_KEY and must never reach the browser.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';

export interface WorkerRun {
    id: string;
    /** The `?worker=` query string. Join key to BlueprintNode.worker. */
    worker: string;
    started_at: string;
    /** NULL means "started and never finished" — a real, diagnosable state. */
    finished_at: string | null;
    ok: boolean | null;
    duration_ms: number | null;
    /** The worker's own return payload, verbatim, when it is a plain object. */
    result: Record<string, unknown> | null;
    error: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS = 500;

/**
 * `result` holds the worker's return payload verbatim, but only when that is a
 * plain object. A NextResponse (or any class instance) would serialise to
 * something useless, so it is stored as NULL rather than as misleading noise.
 */
function plainResult(value: unknown): Record<string, unknown> | null {
    if (value === null || typeof value !== 'object') return null;
    if (Array.isArray(value)) return null;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return null;
    return value as Record<string, unknown>;
}

function errorText(err: unknown): string {
    if (err instanceof Error) return err.message || String(err);
    if (typeof err === 'string') return err;
    try {
        return JSON.stringify(err) ?? String(err);
    } catch {
        return String(err);
    }
}

/** Open a run row. Returns its id, or null if the telemetry write failed. */
async function startRun(worker: string, startedAt: string): Promise<string | null> {
    try {
        const { data, error } = await supabaseAdmin
            .from('worker_runs')
            .insert({ worker, started_at: startedAt })
            .select('id')
            .single();
        if (error) {
            console.warn('[worker-runs] could not open run row:', error.message);
            return null;
        }
        return (data as { id: string } | null)?.id ?? null;
    } catch (e) {
        console.warn('[worker-runs] could not open run row:', errorText(e));
        return null;
    }
}

/** Close a run row. Never throws. */
async function finishRun(
    id: string | null,
    patch: Partial<Pick<WorkerRun, 'finished_at' | 'ok' | 'duration_ms' | 'result' | 'error'>>,
): Promise<void> {
    if (!id) return;
    try {
        const { error } = await supabaseAdmin.from('worker_runs').update(patch).eq('id', id);
        if (error) console.warn('[worker-runs] could not close run row:', error.message);
    } catch (e) {
        console.warn('[worker-runs] could not close run row:', errorText(e));
    }
}

/**
 * Run `fn`, recording a worker_runs row around it.
 *
 * Re-throws whatever `fn` throws, AFTER recording the failure — the caller's
 * catch still runs and still returns its own response.
 */
export async function withRun<T>(worker: string, fn: () => Promise<T>): Promise<T> {
    const t0 = Date.now();
    const startedAt = new Date(t0).toISOString();
    const id = await startRun(worker, startedAt);

    try {
        const value = await fn();
        await finishRun(id, {
            finished_at: new Date().toISOString(),
            ok: true,
            duration_ms: Date.now() - t0,
            result: plainResult(value),
        });
        return value;
    } catch (err) {
        await finishRun(id, {
            finished_at: new Date().toISOString(),
            ok: false,
            duration_ms: Date.now() - t0,
            error: errorText(err),
        });
        throw err;
    }
}

/** Runs from the last `sinceMs` (default 24h), newest first, capped at 500. */
export async function getRecentRuns(sinceMs: number = DAY_MS): Promise<WorkerRun[]> {
    const since = new Date(Date.now() - sinceMs).toISOString();
    try {
        const { data, error } = await supabaseAdmin
            .from('worker_runs')
            .select('*')
            .gte('started_at', since)
            .order('started_at', { ascending: false })
            .limit(MAX_ROWS);
        if (error) {
            console.warn('[worker-runs] could not read recent runs:', error.message);
            return [];
        }
        return (data ?? []) as WorkerRun[];
    } catch (e) {
        console.warn('[worker-runs] could not read recent runs:', errorText(e));
        return [];
    }
}

/**
 * The latest run per worker, for node glow and "last succeeded" readings.
 * Derived from the same recent window rather than a per-worker query, so this
 * is one round trip regardless of how many workers exist.
 */
export async function getLastRunPerWorker(sinceMs: number = DAY_MS): Promise<Record<string, WorkerRun>> {
    const runs = await getRecentRuns(sinceMs);
    const latest: Record<string, WorkerRun> = {};
    for (const run of runs) {
        // getRecentRuns is newest-first, so the first row seen per worker wins.
        if (!latest[run.worker]) latest[run.worker] = run;
    }
    return latest;
}
