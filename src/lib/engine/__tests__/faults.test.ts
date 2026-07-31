import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit coverage for the fault merge. Supabase is mocked at the module boundary:
 * each test seeds a per-table result and the chainable builder below returns it
 * whichever way the query terminates (`.limit()`, `.maybeSingle()`, or awaiting
 * the builder directly).
 *
 * What is actually being protected here is the `nodeId` join. Faults without a
 * node are just strings; the join is what makes them spatial. It must resolve
 * for all three sources, and — the failure mode that would take the whole page
 * down — must degrade to "no node" rather than throwing when a source is not on
 * the map.
 */

const h = vi.hoisted(() => ({
    tables: {} as Record<string, { data: any; error: any }>,
}));

vi.mock('@/lib/supabase/admin', () => {
    const build = (table: string) => {
        const result = () => h.tables[table] ?? { data: null, error: null };
        const chain: any = {};
        for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'lt', 'gt', 'order', 'or', 'is']) {
            chain[m] = () => chain;
        }
        chain.limit = () => Promise.resolve(result());
        chain.maybeSingle = () => Promise.resolve(result());
        chain.single = () => Promise.resolve(result());
        chain.then = (res: any, rej: any) => Promise.resolve(result()).then(res, rej);
        return chain;
    };
    return { supabaseAdmin: { from: (t: string) => build(t) } };
});

import { getFaults, HEALTH_SNAPSHOT_KEY } from '../faults';
import { nodeForErrorSource, nodeForHealthKey } from '@/lib/engine/blueprint';

const set = (table: string, data: any) => { h.tables[table] = { data, error: null }; };

const snapshot = (checks: any[]) => ({
    value: { overall: 'crit', checks, checkedAt: new Date().toISOString() },
    updated_at: new Date(Date.now() - 12 * 60_000).toISOString(),
});

beforeEach(() => {
    for (const k of Object.keys(h.tables)) delete h.tables[k];
});

describe('getFaults — the nodeId join', () => {
    it('resolves a node for all three fault sources', async () => {
        set('engine_config', snapshot([
            { key: 'cron', label: 'Scraper', level: 'crit', detail: 'Last run 300 min ago', actionable: 'Check Vercel cron logs' },
        ]));
        set('error_logs', [
            { source: 'detection-worker', error_message: 'feed timeout', created_at: new Date().toISOString() },
        ]);
        set('posts', [
            { id: 'p1', title: 'Stuck trailer', social_ids: { publish_attempts: 5 } },
        ]);

        const { faults, healthAgeMinutes } = await getFaults();

        const health = faults.find((f) => f.source === 'health')!;
        const err = faults.find((f) => f.source === 'error')!;
        const stuck = faults.find((f) => f.source === 'stuck')!;

        expect(health.nodeId).toBe(nodeForHealthKey('cron')!.id);
        expect(err.nodeId).toBe(nodeForErrorSource('detection-worker')!.id);
        expect(stuck.nodeId).toBe(nodeForErrorSource('publisher')!.id);
        expect(healthAgeMinutes).toBe(12);
    });

    it('gives a stuck post its exact republish URL and the post title', async () => {
        set('posts', [{ id: 'abc-123', title: 'One Piece trailer', social_ids: { publish_attempts: 5 } }]);
        const { faults } = await getFaults();
        const stuck = faults.find((f) => f.source === 'stuck')!;
        expect(stuck.href).toBe('/api/cron?worker=republish-social&postIds=abc-123');
        expect(stuck.detail).toContain('One Piece trailer');
        expect(stuck.level).toBe('crit');
    });

    it('honours the per-cause retry cap and skips posts that reached a platform', async () => {
        set('posts', [
            // video-fetch cap is 2 — exhausted.
            { id: 'v1', title: 'video', social_ids: { publish_attempts: 2, skipped_reason: 'video_fetch_failed' } },
            // default cap is 5 — not exhausted yet.
            { id: 'v2', title: 'not yet', social_ids: { publish_attempts: 3 } },
            // published somewhere, so not stuck at all.
            { id: 'v3', title: 'fine', social_ids: { publish_attempts: 9, instagram_id: '123' } },
        ]);
        const { faults } = await getFaults();
        const stuck = faults.filter((f) => f.source === 'stuck');
        expect(stuck.map((f) => f.key)).toEqual(['stuck.v1']);
    });

    it('degrades an UNMAPPED error source to no node rather than throwing', async () => {
        set('error_logs', [
            { source: 'some-worker-nobody-put-on-the-map', error_message: 'boom', created_at: new Date().toISOString() },
        ]);

        const { faults } = await getFaults();
        const err = faults.find((f) => f.source === 'error')!;
        expect(err).toBeDefined();
        expect(err.nodeId).toBeUndefined();
        expect(err.label).toBe('some-worker-nobody-put-on-the-map');
    });
});

describe('getFaults — error grouping', () => {
    it('groups by source with checkErrors thresholds and the most recent message', async () => {
        const now = Date.now();
        const rows = [
            // newest first, as the query orders them
            ...Array.from({ length: 11 }, (_, i) => ({
                source: 'publisher',
                error_message: i === 0 ? 'latest publisher failure' : 'older',
                created_at: new Date(now - i * 60_000).toISOString(),
            })),
            ...Array.from({ length: 4 }, () => ({
                source: 'fetchers', error_message: 'feed 500', created_at: new Date(now).toISOString(),
            })),
            { source: 'cleanup-worker', error_message: 'one off', created_at: new Date(now).toISOString() },
        ];
        set('error_logs', rows);

        const { faults } = await getFaults();
        const by = (s: string) => faults.find((f) => f.key === `error.${s}`)!;

        expect(by('publisher').level).toBe('crit');
        expect(by('publisher').detail).toContain('11 errors in 24h');
        expect(by('publisher').detail).toContain('latest publisher failure');
        expect(by('fetchers').level).toBe('warn');
        expect(by('cleanup-worker').level).toBe('ok');
    });
});

describe('getFaults — missing health snapshot', () => {
    it('does not throw and reports a null age when the row is absent', async () => {
        // engine_config returns nothing at all: the cron has never written
        // HEALTH_SNAPSHOT_KEY. This is the state the feature ships into.
        expect(HEALTH_SNAPSHOT_KEY).toBe('health_snapshot');
        set('error_logs', [{ source: 'publisher', error_message: 'x', created_at: new Date().toISOString() }]);

        const report = await getFaults();
        expect(report.healthAgeMinutes).toBeNull();
        expect(report.faults.some((f) => f.source === 'health')).toBe(false);
        expect(report.faults.length).toBe(1);
    });

    it('survives a malformed snapshot value', async () => {
        set('engine_config', { value: { nonsense: true }, updated_at: new Date().toISOString() });
        const report = await getFaults();
        expect(report.healthAgeMinutes).toBeNull();
        expect(report.faults).toEqual([]);
    });
});

describe('getFaults — ordering', () => {
    it('puts crit first, then warn, then ok', async () => {
        set('engine_config', snapshot([
            { key: 'storage', label: 'Storage', level: 'ok', detail: '1 GB' },
            { key: 'tier_list', label: 'Anime Tiers', level: 'warn', detail: 'stale' },
            { key: 'meta_token', label: 'Meta Token', level: 'crit', detail: 'expired' },
        ]));
        set('posts', [{ id: 'p9', title: 'stuck', social_ids: { publish_attempts: 5 } }]);

        const { faults } = await getFaults();
        const levels = faults.map((f) => f.level);
        expect(levels).toEqual([...levels].sort((a, b) =>
            ({ crit: 0, warn: 1, ok: 2 })[a] - ({ crit: 0, warn: 1, ok: 2 })[b]));
        expect(levels[0]).toBe('crit');
        expect(levels[levels.length - 1]).toBe('ok');
    });

    it('drops the health checks that sources 2 and 3 supersede', async () => {
        set('engine_config', snapshot([
            { key: 'errors', label: 'Error Rate', level: 'crit', detail: '12 errors in last hour' },
            { key: 'stuck', label: 'Stuck Posts', level: 'crit', detail: '3 posts exhausted retries' },
            { key: 'breaker', label: 'Circuit Breaker', level: 'ok', detail: 'Inactive' },
        ]));
        const { faults } = await getFaults();
        expect(faults.map((f) => f.key)).toEqual(['health.breaker']);
    });
});
