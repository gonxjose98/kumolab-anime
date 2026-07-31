/**
 * slot-drag.test.ts — the Engine clock's drag endpoint.
 *
 * The headline test is the NO-NULL invariant. In this scheduler NULL is not an
 * empty value, it is standby-pool membership with side effects: the pruner in
 * runSlotSelection demotes a pooled post to status='pending' when it ages out,
 * decays below the bar, or falls beyond STANDBY_POOL_SIZE. So a drag that
 * parks a post at NULL can silently UNAPPROVE a post that was already going
 * out. Every drag variant is asserted to leave every post it touched holding a
 * real slot time and still approved.
 *
 * Only supabaseAdmin is mocked: the route's real cap arithmetic (loadSlotClaims
 * → withoutOwnClaim → slotIsFree) and the real ET slot maths run against a
 * fake posts table, so a regression in either is caught here rather than in
 * production.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

// ── fake supabase ──────────────────────────────────────────────────────────
const h = vi.hoisted(() => {
    type Row = Record<string, any>;
    const db: Row[] = [];
    const updateCalls: { table: string; patch: Row }[] = [];
    const rpcCalls: { fn: string; args: Row }[] = [];

    function builder(table: string) {
        const filters: ((r: Row) => boolean)[] = [];
        let mode: 'select' | 'update' = 'select';
        let patch: Row | null = null;
        let returning = false;
        const rows = () => (table === 'posts' ? db : []);

        const exec = () => {
            const matched = rows().filter(r => filters.every(f => f(r)));
            if (mode === 'update') {
                for (const r of matched) Object.assign(r, patch);
                return { data: returning ? matched.map(r => ({ id: r.id })) : null, error: null };
            }
            return { data: matched.map(r => ({ ...r })), error: null };
        };

        const ms = (v: any) => new Date(v).getTime();
        const b: any = {
            select() { if (mode === 'update') returning = true; return b; },
            update(p: Row) { mode = 'update'; patch = p; updateCalls.push({ table, patch: p }); return b; },
            eq(c: string, v: any) { filters.push(r => r[c] === v); return b; },
            neq(c: string, v: any) { filters.push(r => r[c] !== v); return b; },
            is(c: string, v: any) { filters.push(r => (r[c] ?? null) === v); return b; },
            not(c: string, _op: string, v: any) { filters.push(r => (r[c] ?? null) !== v); return b; },
            in(c: string, vs: any[]) { filters.push(r => vs.includes(r[c])); return b; },
            gte(c: string, v: any) { filters.push(r => r[c] != null && ms(r[c]) >= ms(v)); return b; },
            lte(c: string, v: any) { filters.push(r => r[c] != null && ms(r[c]) <= ms(v)); return b; },
            or() { return b; },
            order() { return b; },
            limit() { return b; },
            maybeSingle() { return Promise.resolve({ data: null, error: null }); },
            then(res: any, rej: any) { return Promise.resolve(exec()).then(res, rej); },
        };
        return b;
    }

    const client = {
        from: (t: string) => builder(t),
        rpc: (fn: string, args: Record<string, any>) => {
            rpcCalls.push({ fn, args });
            if (fn !== 'swap_post_slots') return Promise.resolve({ data: null, error: { message: 'no such fn' } });
            const a = db.find(r => r.id === args.post_a);
            const b = db.find(r => r.id === args.post_b);
            if (!a || !b) return Promise.resolve({ data: false, error: null });
            // CAS, exactly as the SQL function does it.
            if (new Date(a.scheduled_post_time).getTime() !== new Date(args.expected_a).getTime()) {
                return Promise.resolve({ data: null, error: { message: 'stale slot for post_a' } });
            }
            if (new Date(b.scheduled_post_time).getTime() !== new Date(args.expected_b).getTime()) {
                return Promise.resolve({ data: null, error: { message: 'stale slot for post_b' } });
            }
            const t = a.scheduled_post_time;
            a.scheduled_post_time = b.scheduled_post_time;
            b.scheduled_post_time = t;
            return Promise.resolve({ data: true, error: null });
        },
    };

    return { db, updateCalls, rpcCalls, client };
});

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: h.client }));

import { POST } from '@/app/api/admin/engine/schedule/route';
import { upcomingPeakSlots, type ConcreteSlot } from '@/lib/engine/scheduler';

// 10:00 ET on a summer Friday — slot 1 (07:30) is past, slots 2 and 3 are ahead.
const NOW = new Date('2026-07-31T14:00:00Z');

vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(NOW);
afterAll(() => vi.useRealTimers());

interface Seed {
    id: string;
    at?: string | null;
    claim_type?: string | null;
    type?: string | null;
    status?: string;
}

function seed(rows: Seed[]) {
    h.db.length = 0;
    for (const r of rows) {
        h.db.push({
            id: r.id,
            title: r.id,
            status: r.status || 'approved',
            type: r.type ?? null,
            claim_type: r.claim_type ?? null,
            scheduled_post_time: r.at ?? null,
            published_at: null,
        });
    }
}

const row = (id: string) => h.db.find(r => r.id === id)!;

async function drag(body: Record<string, unknown>) {
    h.updateCalls.length = 0;
    h.rpcCalls.length = 0;
    const req = new Request('http://localhost/api/admin/engine/schedule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    const res = await POST(req as any);
    return { status: res.status, body: await res.json() as any };
}

let slots: ConcreteSlot[] = [];
beforeEach(async () => {
    seed([]);
    slots = await upcomingPeakSlots(NOW, 7);
});

/** THE invariant: nothing this drag touched sits at NULL or fell out of 'approved'. */
function expectNoPostOrphaned(ids: string[]) {
    for (const id of ids) {
        const r = row(id);
        expect(r.scheduled_post_time, `${id} was left with a NULL slot time (standby-pool exposure)`).not.toBeNull();
        expect(r.scheduled_post_time).toBeTruthy();
        expect(r.status, `${id} left 'approved'`).toBe('approved');
    }
}

describe('slot drag — the no-NULL invariant', () => {
    it('slot fixtures are sane', () => {
        expect(slots.length).toBeGreaterThanOrEqual(20);
        expect(slots[0].at.toISOString()).toBe('2026-07-31T17:00:00.000Z'); // 13:00 ET
        expect(slots[0].etDay).toBe('2026-07-31');
    });

    it('MOVE leaves the post scheduled and approved', async () => {
        seed([{ id: 'a', at: slots[0].at.toISOString() }]);
        const r = await drag({ action: 'move', postId: 'a', toTime: slots[2].at.toISOString() });
        expect(r.body.ok).toBe(true);
        expect(row('a').scheduled_post_time).toBe(slots[2].at.toISOString());
        expectNoPostOrphaned(['a']);
    });

    it('ASSIGN leaves the standby post scheduled and approved', async () => {
        seed([{ id: 's', at: null }]);
        const r = await drag({ action: 'assign', postId: 's', toTime: slots[0].at.toISOString() });
        expect(r.body.ok).toBe(true);
        expectNoPostOrphaned(['s']);
    });

    it('SWAP leaves both posts scheduled and approved', async () => {
        seed([
            { id: 'a', at: slots[0].at.toISOString() },
            { id: 'b', at: slots[1].at.toISOString() },
        ]);
        const r = await drag({ action: 'swap', postId: 'a', targetPostId: 'b' });
        expect(r.body.ok).toBe(true);
        expect(row('a').scheduled_post_time).toBe(slots[1].at.toISOString());
        expect(row('b').scheduled_post_time).toBe(slots[0].at.toISOString());
        expectNoPostOrphaned(['a', 'b']);
    });

    it('CASCADE moves the occupant to the next open slot, never to standby', async () => {
        seed([
            { id: 'occ', at: slots[0].at.toISOString() },
            { id: 's', at: null },
        ]);
        const r = await drag({ action: 'cascade', postId: 's', toTime: slots[0].at.toISOString() });
        expect(r.body.ok).toBe(true);
        expect(row('s').scheduled_post_time).toBe(slots[0].at.toISOString());
        expect(row('occ').scheduled_post_time).toBe(slots[1].at.toISOString());
        expect(r.body.cascaded.id).toBe('occ');
        expectNoPostOrphaned(['s', 'occ']);
    });
});

describe('slot drag — cascade refusal', () => {
    it('refuses (and writes nothing) when no open slot exists', async () => {
        // Every peak slot in the lookahead taken → the occupant has nowhere to go.
        seed([
            ...slots.map((s, i) => ({ id: `p${i}`, at: s.at.toISOString() })),
            { id: 's', at: null },
        ]);
        const before = h.db.map(r => r.scheduled_post_time);

        const r = await drag({ action: 'cascade', postId: 's', toTime: slots[0].at.toISOString() });
        expect(r.body.ok).toBe(false);
        expect(r.body.reason).toMatch(/No open peak slot/i);
        expect(h.updateCalls).toHaveLength(0);
        expect(h.db.map(x => x.scheduled_post_time)).toEqual(before);
        expect(row('s').scheduled_post_time).toBeNull();   // still pooled, untouched
        expect(row('p0').status).toBe('approved');
    });
});

describe('slot drag — the daily cap', () => {
    it('ALLOWS a same-day move on a day already at 3/3', async () => {
        // 2026-08-01 ET: two peak slots taken plus one off-grid post = 3/3,
        // with the 21:30 ET slot still free. Moving the off-grid post into it
        // changes no count — the normal healthy state must not be refused.
        const day = slots.filter(s => s.etDay === '2026-08-01');
        expect(day).toHaveLength(3);
        const target = day[2];                            // 21:30 ET
        seed([
            { id: 'x', at: day[0].at.toISOString() },
            { id: 'y', at: day[1].at.toISOString() },
            { id: 'drag', at: '2026-08-01T15:00:00.000Z' }, // 11:00 ET, off-grid, same ET day
        ]);
        const r = await drag({ action: 'move', postId: 'drag', toTime: target.at.toISOString() });
        expect(r.body.ok, r.body.reason).toBe(true);
        expect(row('drag').scheduled_post_time).toBe(target.at.toISOString());
        expectNoPostOrphaned(['drag']);
    });

    it('REFUSES a 4th post on one ET day (move)', async () => {
        // 2026-08-01 at 3/3, all three claims off-grid so every peak slot on
        // that day is unclaimed — only the cap can refuse this.
        seed([
            { id: 'a1', at: '2026-08-01T13:00:00.000Z' },
            { id: 'a2', at: '2026-08-01T15:00:00.000Z' },
            { id: 'a3', at: '2026-08-01T19:30:00.000Z' },
            { id: 'other', at: slots[0].at.toISOString() },   // lives on 07-31
        ]);
        const target = slots.find(s => s.etDay === '2026-08-01')!;
        const r = await drag({ action: 'move', postId: 'other', toTime: target.at.toISOString() });
        expect(r.body.ok).toBe(false);
        expect(r.body.reason).toMatch(/cap/i);
        expect(row('other').scheduled_post_time).toBe(slots[0].at.toISOString());
        expect(h.updateCalls).toHaveLength(0);
    });

    it('REFUSES a 4th post on one ET day (assign)', async () => {
        seed([
            { id: 'a1', at: '2026-08-01T13:00:00.000Z' },
            { id: 'a2', at: '2026-08-01T15:00:00.000Z' },
            { id: 'a3', at: '2026-08-01T19:30:00.000Z' },
            { id: 's', at: null },
        ]);
        const target = slots.find(s => s.etDay === '2026-08-01')!;
        const r = await drag({ action: 'assign', postId: 's', toTime: target.at.toISOString() });
        expect(r.body.ok).toBe(false);
        expect(r.body.reason).toMatch(/cap/i);
        expect(row('s').scheduled_post_time).toBeNull();
        expect(h.updateCalls).toHaveLength(0);
    });
});

describe('slot drag — key visuals are a separate product', () => {
    it('a NEW_KEY_VISUAL cannot be assigned to a peak slot', async () => {
        seed([{ id: 'kv', at: null, claim_type: 'NEW_KEY_VISUAL' }]);
        const r = await drag({ action: 'assign', postId: 'kv', toTime: slots[0].at.toISOString() });
        expect(r.body.ok).toBe(false);
        expect(r.body.reason).toMatch(/key visual/i);
        expect(h.updateCalls).toHaveLength(0);
    });

    it('a NEW_KEY_VISUAL cannot be moved onto a peak slot', async () => {
        seed([{ id: 'kv', at: '2026-08-01T16:00:00.000Z', claim_type: 'NEW_KEY_VISUAL' }]);
        const r = await drag({ action: 'move', postId: 'kv', toTime: slots[0].at.toISOString() });
        expect(r.body.ok).toBe(false);
        expect(r.body.reason).toMatch(/key visual/i);
        expect(row('kv').scheduled_post_time).toBe('2026-08-01T16:00:00.000Z');
        expect(h.updateCalls).toHaveLength(0);
    });

    it('a NEW_KEY_VISUAL cannot be swapped into a peak slot', async () => {
        seed([
            { id: 'kv', at: '2026-08-01T16:00:00.000Z', claim_type: 'NEW_KEY_VISUAL' },
            { id: 'b', at: slots[0].at.toISOString() },
        ]);
        const r = await drag({ action: 'swap', postId: 'kv', targetPostId: 'b' });
        expect(r.body.ok).toBe(false);
        expect(r.body.reason).toMatch(/key visual/i);
        expect(h.rpcCalls).toHaveLength(0);
    });
});

describe('slot drag — swap is transactional', () => {
    it('goes through the swap_post_slots RPC, not two updates', async () => {
        seed([
            { id: 'a', at: slots[0].at.toISOString() },
            { id: 'b', at: slots[1].at.toISOString() },
        ]);
        const r = await drag({ action: 'swap', postId: 'a', targetPostId: 'b' });
        expect(r.body.ok).toBe(true);
        expect(h.updateCalls, 'swap must not write row-by-row').toHaveLength(0);
        expect(h.rpcCalls).toHaveLength(1);
        expect(h.rpcCalls[0].fn).toBe('swap_post_slots');
        expect(h.rpcCalls[0].args).toEqual({
            post_a: 'a',
            post_b: 'b',
            expected_a: slots[0].at.toISOString(),
            expected_b: slots[1].at.toISOString(),
        });
    });

    it('surfaces a stale CAS as a refusal', async () => {
        seed([
            { id: 'a', at: slots[0].at.toISOString() },
            { id: 'b', at: slots[1].at.toISOString() },
        ]);
        // The scheduler rebooks 'a' between the read and the RPC.
        const orig = h.client.rpc;
        const spy = vi.spyOn(h.client, 'rpc').mockImplementation((fn: string, args: any) => {
            row('a').scheduled_post_time = slots[2].at.toISOString();
            return orig(fn, args);
        });
        const r = await drag({ action: 'swap', postId: 'a', targetPostId: 'b' });
        expect(r.body.ok).toBe(false);
        expect(r.status).toBe(409);
        expect(row('b').scheduled_post_time).toBe(slots[1].at.toISOString());
        spy.mockRestore();
    });
});
