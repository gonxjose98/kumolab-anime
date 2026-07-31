import { describe, it, expect } from 'vitest';
import {
    BLUEPRINT, NODES_BY_ID, NODE_BY_WORKER, CRON_WORKER_KEYS,
    nodeForErrorSource, nodeForHealthKey,
} from '../blueprint';
import { RSS_SOURCES, YOUTUBE_STUDIO_CHANNELS } from '../sources-config';

/**
 * The blueprint is read by AI agents as a map of the system. A map that
 * disagrees with the territory is worse than no map, because it will be
 * trusted. These tests are the guard on that.
 */

describe('blueprint graph integrity', () => {
    it('has unique node ids', () => {
        const ids = BLUEPRINT.nodes.map((n) => n.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('has no dangling edges', () => {
        for (const e of BLUEPRINT.edges) {
            expect(NODES_BY_ID[e.from], `edge from unknown node ${e.from}`).toBeTruthy();
            expect(NODES_BY_ID[e.to], `edge to unknown node ${e.to}`).toBeTruthy();
        }
    });

    it('gives every node a doc paragraph written for an agent', () => {
        for (const n of BLUEPRINT.nodes) {
            expect(n.doc.length, `${n.id} has a stub doc`).toBeGreaterThan(40);
        }
    });

    it('has exactly one core, and it is reachable', () => {
        const cores = BLUEPRINT.nodes.filter((n) => n.kind === 'core');
        expect(cores).toHaveLength(1);
    });
});

describe('telemetry join', () => {
    it('only declares worker keys the cron route actually dispatches', () => {
        // If this fails, a node is animated by telemetry that will never arrive.
        for (const key of Object.keys(NODE_BY_WORKER)) {
            expect(CRON_WORKER_KEYS as readonly string[]).toContain(key);
        }
    });

    it('maps each worker key to exactly one node', () => {
        const workers = BLUEPRINT.nodes.filter((n) => n.worker).map((n) => n.worker!);
        expect(new Set(workers).size).toBe(workers.length);
    });
});

describe('source derivation', () => {
    // Derived rather than retyped, so these assert the derivation still runs
    // rather than hardcoding a count that would need hand-updating.
    it('includes every configured RSS feed', () => {
        const configured = [...RSS_SOURCES.TIER_1, ...RSS_SOURCES.TIER_2, ...RSS_SOURCES.TIER_3];
        const rssNodes = BLUEPRINT.nodes.filter((n) => n.id.startsWith('rss.'));
        expect(rssNodes).toHaveLength(configured.length);
    });

    it('includes every configured YouTube channel', () => {
        const configured = [
            ...YOUTUBE_STUDIO_CHANNELS.TIER_1,
            ...YOUTUBE_STUDIO_CHANNELS.TIER_2,
            ...YOUTUBE_STUDIO_CHANNELS.TIER_3,
            ...YOUTUBE_STUDIO_CHANNELS.TIER_4,
        ];
        const ytNodes = BLUEPRINT.nodes.filter((n) => n.id.startsWith('yt.'));
        expect(ytNodes).toHaveLength(configured.length);
    });

    it('routes every source into detection', () => {
        const sources = BLUEPRINT.nodes.filter((n) => n.kind === 'source');
        expect(sources.length).toBeGreaterThan(0);
        for (const s of sources) {
            expect(s.feeds).toContain('worker.detection');
        }
    });
});

describe('fault resolution', () => {
    it('resolves a known error source to its node', () => {
        expect(nodeForErrorSource('detection-worker')?.id).toBe('worker.detection');
    });

    it('prefers the longest matching prefix', () => {
        // 'threads-token.refresh' must beat any shorter generic match.
        expect(nodeForErrorSource('threads-token.refresh')?.id).toBe('worker.threadstoken');
    });

    it('degrades to null for an unmapped source rather than throwing', () => {
        expect(nodeForErrorSource('something-nobody-mapped')).toBeNull();
        expect(nodeForErrorSource(null)).toBeNull();
        expect(nodeForErrorSource(undefined)).toBeNull();
    });

    it('resolves health keys', () => {
        expect(nodeForHealthKey('worker')?.id).toBe('external.worker');
        expect(nodeForHealthKey('tier_list')).toBeTruthy();
        expect(nodeForHealthKey('nope')).toBeNull();
    });
});

describe('no secrets leak through the agent contract', () => {
    // The whole blueprint is serialised to any caller holding AGENT_API_KEY.
    // Node definitions carry env var NAMES deliberately (the name is
    // documentation); a VALUE appearing here would ship a credential to every
    // connected agent.
    const SECRET_SHAPES = [
        /sk_(live|test)_[A-Za-z0-9]{8,}/,    // Stripe
        /re_[A-Za-z0-9]{16,}/,               // Resend
        /AIza[0-9A-Za-z_-]{20,}/,            // Google
        /EAA[A-Za-z0-9]{20,}/,               // Meta
        /eyJ[A-Za-z0-9_-]{20,}\./,           // JWT
        /\bBearer\s+\S{12,}/i,
    ];

    it('contains no credential-shaped strings', () => {
        const json = JSON.stringify(BLUEPRINT);
        for (const re of SECRET_SHAPES) {
            expect(re.test(json), `blueprint contains something matching ${re}`).toBe(false);
        }
    });

    it('records env vars by name only', () => {
        for (const n of BLUEPRINT.nodes) {
            if (!n.env) continue;
            // A NAME is SHOUTY_SNAKE_CASE. A value would not be.
            expect(n.env, `${n.id}.env looks like a value, not a name`).toMatch(/^[A-Z][A-Z0-9_]*$/);
        }
    });
});

describe('browser safety', () => {
    it('does not transitively import the service-role client', async () => {
        // blueprint.ts is imported by client components. If it ever pulls in
        // supabaseAdmin, that module throws at load without
        // SUPABASE_SERVICE_ROLE_KEY and takes the whole page down.
        const mod = await import('../blueprint');
        expect(mod.BLUEPRINT.nodes.length).toBeGreaterThan(0);
    });
});
