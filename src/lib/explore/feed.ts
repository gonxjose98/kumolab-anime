// AI Insights feed shaping: one importance-ordered list, tab membership, and the
// small left-hand visual each row carries. Pure (no DB), safe for client imports.

import type { InsightRow } from './types';

/** Container run for cards Claude writes by hand from Claude Code sessions. The cron never expires them. */
export const CLAUDE_RUN_ID = '00000000-0000-4000-8000-00000000c1a0';

export type Author = 'auto' | 'claude';
export const authorOf = (row: Pick<InsightRow, 'run_id'>): Author => (row.run_id === CLAUDE_RUN_ID ? 'claude' : 'auto');

/**
 * Every card lands in exactly ONE category (Jose, 2026-10-15):
 *  - upcoming: premieres, returning seasons, episodes airing soon, release-radar anticipation
 *  - news: announcements and stories outlets covered
 *  - recommendation: our-numbers cards whose point is an action (what to post or do next)
 *  - data: facts from our own numbers
 * A premiere or news card that carries a post idea stays in its own category; the idea shows on the card.
 * Claude-authored cards set the category directly as their type.
 */
export type Category = 'data' | 'recommendation' | 'upcoming' | 'news';
const DIRECT = new Set<string>(['data', 'recommendation', 'upcoming', 'news']);

export function categoryOf(row: Pick<InsightRow, 'section' | 'type' | 'kind'>): Category {
    if (DIRECT.has(row.type)) return row.type as Category;
    if (row.section === 'world') return row.type === 'news' ? 'news' : 'upcoming';
    return row.kind === 'recommendation' ? 'recommendation' : 'data';
}

export type FeedTab = 'all' | Category;

export const FEED_TABS: { key: FeedTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'data', label: 'Data' },
    { key: 'recommendation', label: 'Recommendations' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'news', label: 'News' },
];

export const CATEGORY_LABEL = { data: 'Data', recommendation: 'Recommendation', upcoming: 'Upcoming', news: 'News' } as const;

export interface NumberTile {
    text: string;
    sub: string;
    tone: 'up' | 'down' | 'neutral';
}

export interface FeedItem extends InsightRow {
    state: 'new' | 'acted';
    /** Poster / article image for anime-world rows, when one is known. */
    poster: string | null;
    /** Colored number tile for our-numbers rows, derived from the cited figures. */
    tile: NumberTile | null;
}

export function inTab(row: Pick<InsightRow, 'section' | 'type' | 'kind'>, tab: FeedTab): boolean {
    return tab === 'all' || categoryOf(row) === tab;
}

/**
 * Importance order: the model already ranks inside each section, so mix them
 * two anime-world rows to one of ours (premieres and news lead, numbers stay visible).
 */
export function orderFeed<T extends Pick<InsightRow, 'rank'>>(world: T[], ours: T[]): T[] {
    const w = [...world].sort((a, b) => a.rank - b.rank);
    const o = [...ours].sort((a, b) => a.rank - b.rank);
    const out: T[] = [];
    while (w.length || o.length) {
        if (w.length) out.push(w.shift()!);
        if (w.length) out.push(w.shift()!);
        if (o.length) out.push(o.shift()!);
    }
    return out;
}

const PLATFORM: Record<string, string> = { instagram: 'Instagram', threads: 'Threads', website: 'Website', x: 'X' };

export function compact(n: number): string {
    const a = Math.abs(n);
    if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (a >= 10_000) return `${Math.round(n / 1000)}K`;
    if (a >= 1_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
    return String(Math.round(n));
}

/** Number tile for our-numbers rows. Uses only figures the cited source vouches for. */
export function tileFor(row: Pick<InsightRow, 'section' | 'type' | 'sources'>): NumberTile | null {
    if (row.section !== 'ours') return null;
    const src = row.sources || [];
    const views = src.find((s) => /^views:[a-z]+:(7d|30d)$/.test(s.ref));
    if (views && (row.type === 'trend_up' || row.type === 'trend_down') && views.values.length >= 3) {
        const [, platform, win] = views.ref.split(':');
        const change = Math.round(views.values[2]);
        return {
            text: `${change > 0 ? '+' : ''}${change}%`,
            sub: `${PLATFORM[platform] ?? platform} · ${win === '7d' ? 'week' : 'month'}`,
            tone: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral',
        };
    }
    const post = src.find((s) => s.ref.startsWith('post:'));
    if (post && row.type === 'top_post' && post.values.length) {
        return { text: compact(post.values[0]), sub: 'IG views', tone: 'neutral' };
    }
    const fol = src.find((s) => s.ref.startsWith('followers:'));
    if (fol && row.type === 'followers' && fol.values.length >= 3) {
        const d = Math.round(fol.values[2]);
        return { text: `${d > 0 ? '+' : ''}${compact(d)}`, sub: `${PLATFORM[fol.ref.split(':')[1]] ?? ''} followers`.trim(), tone: d > 0 ? 'up' : d < 0 ? 'down' : 'neutral' };
    }
    return null;
}

/** "5 hours ago" style, relative to a fixed `now` so server and client agree. */
export function agoText(iso: string, now: number): string {
    const ms = Math.max(0, now - Date.parse(iso));
    const m = Math.floor(ms / 60_000);
    if (m < 60) return m <= 1 ? 'just now' : `${m} minutes ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
    const d = Math.floor(h / 24);
    return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** Topic for the "Insights by topic" bars and the dismissed note. */
export function topicOf(row: Pick<InsightRow, 'section' | 'type' | 'kind'>): 'System' | (typeof CATEGORY_LABEL)[Category] {
    if (row.section === 'system') return 'System';
    return CATEGORY_LABEL[categoryOf(row)];
}
