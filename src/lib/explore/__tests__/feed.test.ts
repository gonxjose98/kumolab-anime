import { describe, it, expect } from 'vitest';
import { CLAUDE_RUN_ID, FEED_TABS, authorOf, categoryOf, inTab } from '../feed';

type Row = { section: 'world' | 'ours' | 'system'; type: string; kind: 'fact' | 'recommendation' };
const row = (section: Row['section'], type: string, kind: Row['kind'] = 'fact'): Row => ({ section, type, kind });

describe('categoryOf: every card in exactly one category', () => {
    it('anime world', () => {
        expect(categoryOf(row('world', 'premiere'))).toBe('upcoming');
        expect(categoryOf(row('world', 'premiere', 'recommendation'))).toBe('upcoming');
        expect(categoryOf(row('world', 'trending'))).toBe('upcoming');
        expect(categoryOf(row('world', 'news'))).toBe('news');
        expect(categoryOf(row('world', 'news', 'recommendation'))).toBe('news');
    });
    it('our numbers', () => {
        for (const t of ['trend_up', 'trend_down', 'format', 'timing', 'top_post', 'followers']) {
            expect(categoryOf(row('ours', t))).toBe('data');
            expect(categoryOf(row('ours', t, 'recommendation'))).toBe('recommendation');
        }
    });
    it('Claude cards name their category', () => {
        for (const c of ['data', 'recommendation', 'upcoming', 'news'] as const) expect(categoryOf(row('ours', c))).toBe(c);
    });
    it('a card matches exactly one non-All tab', () => {
        const cards = [row('world', 'premiere', 'recommendation'), row('world', 'news', 'recommendation'), row('world', 'trending'),
            row('ours', 'format', 'recommendation'), row('ours', 'trend_down'), row('ours', 'upcoming', 'recommendation')];
        for (const c of cards) expect(FEED_TABS.filter((t) => t.key !== 'all' && inTab(c, t.key))).toHaveLength(1);
    });
});

describe('authorOf', () => {
    it('splits Claude cards from the auto agent by run id', () => {
        expect(authorOf({ run_id: CLAUDE_RUN_ID })).toBe('claude');
        expect(authorOf({ run_id: 'b6f1c0de-0000-4000-8000-000000000001' })).toBe('auto');
        expect(authorOf({})).toBe('auto');
    });
});
