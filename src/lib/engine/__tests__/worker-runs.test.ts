import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CRON_WORKER_KEYS } from '../blueprint';

// One fake supabaseAdmin, recording what withRun writes. `vi.hoisted` because
// vi.mock is hoisted above the imports and cannot close over ordinary consts.
const db = vi.hoisted(() => ({
    inserts: [] as any[],
    updates: [] as any[],
    fail: { insert: false, insertError: false, update: false },
}));

vi.mock('@/lib/supabase/admin', () => ({
    supabaseAdmin: {
        from: (table: string) => ({
            insert: (row: any) => {
                // The realistic failure: the client itself throws (bad env,
                // network, table missing) rather than returning an error.
                if (db.fail.insert) throw new Error('insert exploded');
                db.inserts.push({ table, row });
                return {
                    select: () => ({
                        single: async () =>
                            db.fail.insertError
                                ? { data: null, error: { message: 'insert rejected' } }
                                : { data: { id: 'run-1' }, error: null },
                    }),
                };
            },
            update: (patch: any) => ({
                eq: async (column: string, value: any) => {
                    if (db.fail.update) throw new Error('update exploded');
                    db.updates.push({ table, patch, column, value });
                    return { error: null };
                },
            }),
        }),
    },
}));

// Imported after the mock declaration for readability only — vi.mock is hoisted
// above every import, so worker-runs always gets the fake client.
import { withRun } from '../worker-runs';

beforeEach(() => {
    db.inserts.length = 0;
    db.updates.length = 0;
    db.fail = { insert: false, insertError: false, update: false };
    vi.restoreAllMocks();
});

describe('withRun', () => {
    it('opens the row BEFORE the worker runs, so a crash still leaves evidence', async () => {
        let insertsAtCallTime = -1;
        await withRun('detection', async () => {
            insertsAtCallTime = db.inserts.length;
            return { candidates: 3 };
        });

        // The whole point: a worker that never returns still has a row with
        // finished_at IS NULL, which is a diagnosable stalled state.
        expect(insertsAtCallTime).toBe(1);
        expect(db.inserts[0].table).toBe('worker_runs');
        expect(db.inserts[0].row.worker).toBe('detection');
        expect(db.inserts[0].row.started_at).toBeTruthy();
    });

    it('records success with the worker payload verbatim', async () => {
        const value = await withRun('processing', async () => ({ accepted: 3, rejected: 1 }));

        expect(value).toEqual({ accepted: 3, rejected: 1 });
        expect(db.updates).toHaveLength(1);
        const { patch, column, value: id } = db.updates[0];
        expect(column).toBe('id');
        expect(id).toBe('run-1');
        expect(patch.ok).toBe(true);
        expect(patch.finished_at).toBeTruthy();
        expect(typeof patch.duration_ms).toBe('number');
        expect(patch.result).toEqual({ accepted: 3, rejected: 1 });
        expect(patch.error).toBeUndefined();
    });

    it('stores null rather than a useless blob for non-plain return values', async () => {
        // A NextResponse (or any class instance) would serialise to nothing
        // meaningful, so it is recorded as null instead of misleading noise.
        class NotPlain { constructor(public status = 200) { } }
        await withRun('publish', async () => new NotPlain());
        expect(db.updates[0].patch.result).toBeNull();

        db.updates.length = 0;
        await withRun('publish', async () => null);
        expect(db.updates[0].patch.result).toBeNull();
    });

    it('records failure', async () => {
        await expect(
            withRun('cleanup', async () => { throw new Error('bucket sweep failed'); }),
        ).rejects.toThrow('bucket sweep failed');

        expect(db.updates).toHaveLength(1);
        expect(db.updates[0].patch.ok).toBe(false);
        expect(db.updates[0].patch.error).toBe('bucket sweep failed');
        expect(typeof db.updates[0].patch.duration_ms).toBe('number');
    });

    it('RE-THROWS the worker error rather than swallowing it', async () => {
        // The cron route's own catch must still run and still return its 500.
        // Telemetry that ate the error would turn a crash into a silent 200.
        const boom = new Error('worker crashed');
        let caught: unknown = null;
        try {
            await withRun('detection', async () => { throw boom; });
        } catch (e) {
            caught = e;
        }
        expect(caught).toBe(boom);
    });

    it('does not throw, and still runs the worker, when the telemetry insert fails', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        db.fail.insert = true;

        let ran = false;
        const value = await withRun('detection', async () => { ran = true; return { ok: 1 }; });

        expect(ran).toBe(true);
        expect(value).toEqual({ ok: 1 });
        // No row id, so no close attempt — and crucially no thrown error.
        expect(db.updates).toHaveLength(0);
    });

    it('does not throw when the insert returns an error row', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        db.fail.insertError = true;
        await expect(withRun('detection', async () => ({ ok: 1 }))).resolves.toEqual({ ok: 1 });
        expect(db.updates).toHaveLength(0);
    });

    it('does not throw when the closing update fails', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        db.fail.update = true;
        await expect(withRun('detection', async () => ({ ok: 1 }))).resolves.toEqual({ ok: 1 });
    });

    it('still re-throws the worker error when telemetry is also broken', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => { });
        db.fail.insert = true;
        db.fail.update = true;
        await expect(
            withRun('detection', async () => { throw new Error('real failure'); }),
        ).rejects.toThrow('real failure');
    });
});

describe('worker key set', () => {
    // worker_runs.worker, BlueprintNode.worker and the cron route's ?worker=
    // strings are ONE join key. A rename on either side unhooks a node's
    // telemetry silently — nothing errors, the node just goes dark forever.
    const routeSource = readFileSync(
        fileURLToPath(new URL('../../../app/api/cron/route.ts', import.meta.url)),
        'utf8',
    );

    it('matches the cron route dispatch chain exactly', () => {
        const dispatched = new Set(
            [...routeSource.matchAll(/worker === '([a-z0-9-]+)'/g)]
                .map((m) => m[1])
                // diag-* are ad-hoc diagnostics, not part of the scheduled surface.
                .filter((w) => !w.startsWith('diag-')),
        );

        expect([...dispatched].sort()).toEqual([...CRON_WORKER_KEYS].sort());
    });

    it('is reflected in the invalid-worker hint the route returns', () => {
        for (const key of CRON_WORKER_KEYS) {
            expect(routeSource).toContain(`'${key}'`);
        }
    });
});
