// Shared metric config + formatters for the monthly reporting views
// (MonthlyReports internal dashboard + SponsorGenerator external one-pager).
// One source of truth so both render the exact same numbers the same way.

import type { MonthlyReportRow } from '@/lib/analytics/monthly-report';

export type Fmt = 'int' | 'pct' | 'money' | 'dur';

export interface MetricSpec {
    label: string;
    path: string; // e.g. 'website.users' or 'instagram.posts.views'
    prov?: string; // provenance key in row.meta (defaults to `path`)
    fmt?: Fmt;
}

export interface Section {
    key: string;
    title: string;
    accent: string; // color for the platform accent bar/label
    subtitle: string;
    metrics: MetricSpec[];
}

// Each platform is its own group with a distinct accent, so it's always
// obvious which numbers belong to Website vs Instagram vs Facebook, etc.
export const SECTIONS: Section[] = [
    {
        key: 'website',
        title: 'Website',
        accent: '#3a8be0',
        subtitle: 'kumolabanime.com · Google Analytics + first-party',
        metrics: [
            { label: 'Users', path: 'website.users' },
            { label: 'New users', path: 'website.new_users' },
            { label: 'Returning users', path: 'website.returning_users' },
            { label: 'Sessions', path: 'website.sessions' },
            { label: 'Avg session', path: 'website.avg_session_sec', fmt: 'dur' },
            { label: 'Organic (Google)', path: 'website.organic_sessions' },
            { label: 'Pageviews (first-party)', path: 'website.pageviews' },
            { label: 'Pageviews (GA4)', path: 'website.ga4_pageviews' },
            { label: 'Google referrals', path: 'website.google_referrals' },
            { label: 'Email signups', path: 'website.email_signups' },
        ],
    },
    {
        key: 'instagram',
        title: 'Instagram',
        accent: '#d6317f',
        subtitle: '@kumolabanime · account insights + per-post',
        metrics: [
            { label: 'Followers', path: 'instagram.followers' },
            { label: 'Reach', path: 'instagram.reach' },
            { label: 'Views', path: 'instagram.views' },
            { label: 'Profile visits', path: 'instagram.profile_views' },
            { label: 'Website clicks', path: 'instagram.website_clicks' },
            { label: 'Interactions', path: 'instagram.interactions' },
            { label: 'Engagement rate', path: 'instagram.engagement_rate', fmt: 'pct' },
            { label: 'Avg reel views', path: 'instagram.avg_reel_views' },
            { label: 'Posts published', path: 'instagram.posts.count', prov: 'instagram.posts' },
            { label: 'Post views', path: 'instagram.posts.views', prov: 'instagram.posts' },
            { label: 'Post likes', path: 'instagram.posts.likes', prov: 'instagram.posts' },
            { label: 'Post comments', path: 'instagram.posts.comments', prov: 'instagram.posts' },
        ],
    },
    {
        key: 'facebook',
        title: 'Facebook',
        accent: '#4267B2',
        subtitle: 'KumoLab Page · trailing-30 snapshot + per-post',
        metrics: [
            { label: 'Followers', path: 'facebook.followers' },
            { label: 'Views', path: 'facebook.views' },
            { label: 'Engagement', path: 'facebook.engagement' },
            { label: 'Reach', path: 'facebook.reach' },
            { label: 'Posts published', path: 'facebook.posts.count', prov: 'facebook.posts' },
            { label: 'Post views', path: 'facebook.posts.views', prov: 'facebook.posts' },
        ],
    },
    {
        key: 'threads',
        title: 'Threads',
        accent: '#8a94a6',
        subtitle: '@kumolabanime · trailing-30 snapshot + per-post',
        metrics: [
            { label: 'Followers', path: 'threads.followers' },
            { label: 'Views', path: 'threads.views' },
            { label: 'Engagement', path: 'threads.engagement' },
            { label: 'Posts published', path: 'threads.posts.count', prov: 'threads.posts' },
            { label: 'Post views', path: 'threads.posts.views', prov: 'threads.posts' },
        ],
    },
    {
        key: 'youtube',
        title: 'YouTube',
        accent: '#d0433a',
        subtitle: 'Channel · not wired yet',
        metrics: [
            { label: 'Subscribers', path: 'youtube.subscribers' },
            { label: 'Views', path: 'youtube.views' },
            { label: 'Watch time (hrs)', path: 'youtube.watch_time_hours' },
        ],
    },
    {
        key: 'business',
        title: 'Business',
        accent: '#35a877',
        subtitle: 'Store + publishing',
        metrics: [
            { label: 'Revenue', path: 'business.revenue', fmt: 'money' },
            { label: 'Orders', path: 'business.orders' },
            { label: 'Posts published', path: 'business.posts_published' },
        ],
    },
];

// ── Formatting ───────────────────────────────────────────────────────────────

export const fmtInt = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'));
export const fmtPct = (n: number | null | undefined) => (n == null ? '—' : `${n}%`);
export const fmtMoney = (n: number | null | undefined, ccy = 'USD') =>
    n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy || 'USD' }).format(n);
export const fmtDur = (s: number | null | undefined) => {
    if (s == null) return '—';
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
};

export function fmtVal(v: number | null, fmt: Fmt | undefined, ccy: string): string {
    switch (fmt) {
        case 'pct': return fmtPct(v);
        case 'money': return fmtMoney(v, ccy);
        case 'dur': return fmtDur(v);
        default: return fmtInt(v);
    }
}

/** Walk a dotted path (section.field[.subfield]) to a numeric leaf, else null. */
export function getVal(row: MonthlyReportRow | null, path: string): number | null {
    if (!row) return null;
    const parts = path.split('.');
    let cur: unknown = row;
    for (const p of parts) {
        if (cur == null || typeof cur !== 'object') return null;
        cur = (cur as Record<string, unknown>)[p];
    }
    return typeof cur === 'number' ? cur : null;
}

export function monthLabel(month: string): string {
    return new Date(`${month.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'long', year: 'numeric', timeZone: 'UTC',
    });
}
