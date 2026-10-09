import { describe, it, expect } from 'vitest';
import { validateCards, extractNumbers, extractDates, stripDashes } from '../validate';
import { reminderWindow, levelForDays, daysUntil, scrub } from '../tokens';
import { outputSchema, userTurn } from '../prompts';
import type { Digest, RawCard } from '../types';

const digest: Digest = {
    section: 'ours',
    generatedAt: '2026-10-09T12:00:00Z',
    facts: {},
    missing: [],
    hasData: true,
    refs: {
        'views:instagram:7d': {
            kind: 'metric', label: 'Instagram views, week over week',
            text: 'Instagram views Oct 2 to Oct 8: 3,338, prior 7 days: 21,345 (-84.4%)',
            values: [3338, 21345, -84.4],
        },
        'format:reel': {
            kind: 'metric', label: 'Reels, last 30 days',
            text: 'Reels in the last 30 days: 38 posts with metrics, median Instagram views 812, median Instagram reach 640, median Threads views 120',
            values: [38, 812, 640, 120],
        },
        'post:abc': {
            kind: 'post', label: "Kaiju No. 8 Season 2 trailer", url: 'https://instagram.com/p/1',
            text: 'Reel published Oct 3 at 7:30 AM ET: Instagram views 1,234, reach 900, likes 40, comments 2; Threads views 56',
            values: [1234, 900, 40, 2, 56],
        },
    },
};

const card = (over: Partial<RawCard>): RawCard => ({
    type: 'trend_down', kind: 'fact', title: 'Instagram views down 84% week over week',
    why: '3,338 vs 21,345 for the prior 7 days', details: '', recommendation: '',
    sources: ['views:instagram:7d'], anime: '', confidence: 'high', ...over,
});

describe('validateCards', () => {
    it('keeps a card whose numbers all come from its sources', () => {
        const { cards, drops } = validateCards('ours', [card({})], digest);
        expect(drops).toEqual([]);
        expect(cards).toHaveLength(1);
        expect(cards[0].sources[0].url).toBeUndefined();
        expect(cards[0].sources[0].text).toContain('3,338');
    });

    it('drops a card citing a ref that is not in the digest', () => {
        const { cards, drops } = validateCards('ours', [card({ sources: ['views:tiktok:7d'] })], digest);
        expect(cards).toHaveLength(0);
        expect(drops[0].reason).toMatch(/unknown source/);
    });

    it('drops a card with no sources', () => {
        expect(validateCards('ours', [card({ sources: [] })], digest).cards).toHaveLength(0);
    });

    it('drops an invented number', () => {
        const { drops } = validateCards('ours', [card({ why: 'Lost 5,000 views since Monday' })], digest);
        expect(drops[0].reason).toMatch(/number 5000/);
    });

    it('drops a number that exists only in an uncited source', () => {
        const { drops } = validateCards('ours', [card({ details: 'Reels median 812 views' })], digest);
        expect(drops[0].reason).toMatch(/812/);
    });

    it('accepts rounding and K shorthand', () => {
        const { cards } = validateCards('ours', [card({ title: 'IG views fell 84.4%', why: 'About 3.3K vs 21.3K' })], digest);
        expect(cards).toHaveLength(1);
    });

    it('allows numbers in a cited anime title and its dates and times', () => {
        const { cards, drops } = validateCards('ours', [card({
            type: 'top_post', title: 'Kaiju No. 8 Season 2 trailer led the week',
            why: '1,234 Instagram views, posted Oct 3 at 7:30 AM', sources: ['post:abc'],
        })], digest);
        expect(drops).toEqual([]);
        expect(cards).toHaveLength(1);
    });

    it('drops a date the sources never mention', () => {
        const { drops } = validateCards('ours', [card({ why: 'Since Oct 1, views fell to 3,338' })], digest);
        expect(drops[0].reason).toMatch(/date "oct 1"/);
    });

    it('drops hype words the sources do not contain', () => {
        const { drops } = validateCards('ours', [card({ title: 'Reels went viral', sources: ['format:reel'] , type: 'format', why: 'Median 812 views' })], digest);
        expect(drops[0].reason).toMatch(/viral/);
    });

    it('drops a type that does not belong to the section', () => {
        const { drops } = validateCards('ours', [card({ type: 'news' })], digest);
        expect(drops[0].reason).toMatch(/not allowed/);
    });

    it('labels any card with an action line as a recommendation', () => {
        const { cards } = validateCards('ours', [card({ kind: 'fact', recommendation: 'Lean on reels this week' })], digest);
        expect(cards[0].kind).toBe('recommendation');
    });

    it('caps the section at 5 cards and ranks them', () => {
        const many = Array.from({ length: 7 }, () => card({}));
        const { cards, drops } = validateCards('ours', many, digest);
        expect(cards).toHaveLength(5);
        expect(cards.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5]);
        expect(drops.filter((d) => /cap/.test(d.reason))).toHaveLength(2);
    });

    it('strips em and en dashes from copy', () => {
        const dash = String.fromCharCode(8212);
        const { cards } = validateCards('ours', [card({ title: `Instagram views ${dash} down 84%` })], digest);
        expect(cards[0].title).not.toContain(dash);
        expect(stripDashes(`a ${String.fromCharCode(8211)} b`)).toBe('a, b');
    });
});

describe('number and date extraction', () => {
    it('parses commas, decimals, K and M', () => {
        expect(extractNumbers('3,338 views, 2.5K reach, 1.2M plays').map((n) => n.value)).toEqual([3338, 2500, 1200000]);
    });
    it('ignores dates and times when extracting numbers', () => {
        expect(extractNumbers('Oct 8 at 7:30 AM').map((n) => n.value)).toEqual([]);
        expect(extractDates('from Oct 2 to October 8, 2026')).toEqual(['oct 2', 'oct 8']);
    });
});

describe('token reminder windows', () => {
    it('maps days left to the 30/14/7/3/2/1 thresholds', () => {
        expect(reminderWindow(45)).toBeNull();
        expect(reminderWindow(30)).toBe(30);
        expect(reminderWindow(29)).toBe(30);
        expect(reminderWindow(15)).toBe(30);
        expect(reminderWindow(14)).toBe(14);
        expect(reminderWindow(8)).toBe(14);
        expect(reminderWindow(7)).toBe(7);
        expect(reminderWindow(4)).toBe(7);
        expect(reminderWindow(3)).toBe(3);
        expect(reminderWindow(2)).toBe(2);
        expect(reminderWindow(1)).toBe(1);
        expect(reminderWindow(0)).toBe(0);
        expect(reminderWindow(-3)).toBe(0);
        expect(reminderWindow(null)).toBeNull();
    });
    it('levels: crit at 7 or fewer days, warn inside 30', () => {
        expect(levelForDays(7)).toBe('crit');
        expect(levelForDays(20)).toBe('warn');
        expect(levelForDays(57)).toBe('ok');
    });
    it('counts whole days', () => {
        const now = Date.parse('2026-10-09T05:00:00Z');
        expect(daysUntil(Date.parse('2026-12-05T05:00:36Z'), now)).toBe(57);
    });
    it('scrubs anything token-shaped', () => {
        expect(scrub('Malformed access token EAAFAKEfakeFAKEfakeFAKEfakeFAKEfake0000')).toBe('Malformed access token [redacted]');
    });
});

describe('prompt plumbing', () => {
    it('schema enum matches the section card types', () => {
        const s = outputSchema('world');
        expect(s.properties.cards.items.properties.type.enum).toEqual(['trending', 'news', 'premiere']);
    });
    it('user turn carries ref sentences in sorted order', () => {
        const t = userTurn({ a: 1 }, digest.refs);
        expect(t.indexOf('format:reel')).toBeLessThan(t.indexOf('post:abc'));
    });
});
