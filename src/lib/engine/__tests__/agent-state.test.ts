import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The agent contract is the whole reason this system is legible to an AI agent.
 * These tests lock what it must contain, because the failure mode is silent: a
 * contract that quietly loses a section still returns 200, and an agent reading
 * it just makes worse decisions with no error anywhere.
 */

const rows: Record<string, unknown[]> = {
    posts: [],
    engine_config: [],
    anime_tiers: [],
    agent_sessions: [],
    worker_runs: [],
    error_logs: [],
};

function table(name: string) {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    Object.assign(q, {
        select: chain, eq: chain, neq: chain, gte: chain, lte: chain, lt: chain,
        gt: chain, or: chain, not: chain, is: chain, order: chain,
        limit: () => Promise.resolve({ data: rows[name] ?? [], error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows[name] ?? [], error: null }).then(res),
    });
    return q;
}

vi.mock('@/lib/supabase/admin', () => ({
    supabaseAdmin: {
        from: (name: string) => table(name),
        rpc: () => Promise.resolve({ data: null, error: null }),
    },
}));

describe('agent state contract', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('exposes the four things an agent needs to make a decision', async () => {
        const { getAgentState } = await import('../agent-state');
        const s = await getAgentState();

        // What the system IS, what it DECIDES BY, what is IN it, how it is DOING.
        expect(s.graph.nodes.length).toBeGreaterThan(0);
        expect(s.rules).toBeTruthy();
        expect(s.content).toBeTruthy();
        expect(s.status).toBeTruthy();

        expect(s.contract).toBe(1);
        expect(s.readme.length).toBeGreaterThan(200);
    });

    it('carries every rule class the engine actually enforces', async () => {
        const { getAgentState } = await import('../agent-state');
        const { rules } = await getAgentState();

        expect(rules.formula.length).toBeGreaterThan(0);
        expect(rules.goals.length).toBeGreaterThan(0);
        expect(rules.peakSlots.length).toBeGreaterThan(0);

        // Scoring: an agent cannot judge a post without the bar and the weights.
        expect(rules.scoring.autoPublishMin).toBe(75);
        expect(rules.scoring.reviewMin).toBe(55);
        expect(rules.scoring.components.reduce((a, c) => a + c.max, 0)).toBe(100);
        expect(rules.scoring.hardGates).toContain('anime_only');

        // Approval routing.
        expect(rules.approval.matrix.TRAILER_DROP).toBeTruthy();
        expect(rules.approval.corroboration.minSources).toBeGreaterThan(0);

        // Caps — the 3/day Instagram cap is the single most load-bearing number.
        expect(rules.platforms.dailyCap.instagram).toBe(3);

        expect(rules.contentPolicy.offTopicKeywords.length).toBeGreaterThan(0);
        expect(rules.contentPolicy.sources.rssFeeds.length).toBeGreaterThan(0);
    });

    it('separates the standby pool from booked slots', async () => {
        // The distinction an agent MUST understand: a booked slot is committed,
        // the pool is still competing. Collapsing them into one list would make
        // the whole selection model unreadable.
        const { getAgentState } = await import('../agent-state');
        const { content } = await getAgentState();
        expect(content).toHaveProperty('pending');
        expect(content).toHaveProperty('standby');
        expect(content).toHaveProperty('scheduled');
        expect(content).toHaveProperty('publishedLast24h');
        expect(content.counts).toBeTruthy();
    });

    it('warns about the NULL trap in the readme', async () => {
        // Writing NULL to scheduled_post_time can silently unapprove a post.
        // An agent that does not know this will eventually do it.
        const { getAgentState } = await import('../agent-state');
        const { readme } = await getAgentState();
        expect(readme).toMatch(/NULL/);
        // \s+ not a literal space: the readme is hard-wrapped, so the phrase
        // can straddle a newline.
        expect(readme.toLowerCase()).toMatch(/pool\s+membership/);
    });

    it('leaks no credential-shaped strings', async () => {
        const { getAgentState } = await import('../agent-state');
        const json = JSON.stringify(await getAgentState());
        for (const re of [
            /sk_(live|test)_[A-Za-z0-9]{8,}/,
            /re_[A-Za-z0-9]{16,}/,
            /AIza[0-9A-Za-z_-]{20,}/,
            /EAA[A-Za-z0-9]{20,}/,
            /eyJ[A-Za-z0-9_-]{20,}\./,
        ]) {
            expect(re.test(json), `contract contains something matching ${re}`).toBe(false);
        }
    });
});
