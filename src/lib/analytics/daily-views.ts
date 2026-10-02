// Daily views per platform → public.daily_views.
//
// Meta returns account insights only in 30-day windows, so the Analytics tab
// stores each day itself. Collectors are idempotent (upsert on day+platform):
// the metrics-sync cron and the Analytics page both refresh the last few days,
// and scripts/analytics/backfill-daily-views.ts loads history once.
import { supabaseAdmin } from '@/lib/supabase/admin';

export type ViewPlatform = 'website' | 'instagram' | 'threads' | 'x';
export const VIEW_PLATFORMS: ViewPlatform[] = ['website', 'instagram', 'threads', 'x'];

const GRAPH = 'https://graph.facebook.com/v22.0';
const THREADS = 'https://graph.threads.net/v1.0';
const DAY_MS = 86_400_000;

export const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const dayStartSec = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 1000);

/** Every UTC day from `from` to `to`, inclusive. */
export function daysBetween(from: string, to: string): string[] {
    const out: string[] = [];
    for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY_MS) out.push(dayKey(new Date(t)));
    return out;
}

type Row = { day: string; platform: ViewPlatform; views: number };

async function upsert(rows: Row[]) {
    if (!rows.length) return;
    const stamped = rows.map((r) => ({ ...r, updated_at: new Date().toISOString() }));
    for (let i = 0; i < stamped.length; i += 500) {
        const { error } = await supabaseAdmin.from('daily_views').upsert(stamped.slice(i, i + 500), { onConflict: 'day,platform' });
        if (error) throw new Error(`daily_views upsert: ${error.message}`);
    }
}

/** Run async jobs with a small concurrency cap (keeps Meta + Supabase happy). */
async function pool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
        while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
    }));
    return out;
}

// ── Collectors ─────────────────────────────────────────────────────────────

/** Bot-filtered page views per UTC day, counted in the database. */
async function collectWebsite(days: string[]): Promise<Row[]> {
    return pool(days, 8, async (day) => {
        const start = `${day}T00:00:00Z`;
        const end = new Date(Date.parse(start) + DAY_MS).toISOString();
        const { count, error } = await supabaseAdmin
            .from('page_views')
            .select('id', { count: 'exact', head: true })
            .gte('timestamp', start)
            .lt('timestamp', end)
            .not('is_bot', 'is', true);
        if (error) throw new Error(`website ${day}: ${error.message}`);
        return { day, platform: 'website' as const, views: count || 0 };
    });
}

/** IG account `views` per UTC day. Meta only allows total_value, so one call per day. */
async function collectInstagram(days: string[]): Promise<Row[]> {
    const token = process.env.META_ACCESS_TOKEN, ig = process.env.META_IG_ID;
    if (!token || !ig) return [];
    const rows = await pool(days, 6, async (day): Promise<Row | null> => {
        const since = dayStartSec(day);
        const r = await fetch(`${GRAPH}/${ig}/insights?metric=views&period=day&metric_type=total_value&since=${since}&until=${since + 86400}&access_token=${token}`, { cache: 'no-store' });
        const j = await r.json();
        const v = j?.data?.[0]?.total_value?.value;
        // Skip errors rather than writing a false 0.
        return typeof v === 'number' ? { day, platform: 'instagram', views: v } : null;
    });
    return rows.filter((r): r is Row => r !== null);
}

/** Threads account `views` as a daily series, fetched in 30-day windows. */
async function collectThreads(days: string[]): Promise<Row[]> {
    const token = process.env.THREADS_ACCESS_TOKEN, user = process.env.THREADS_USER_ID;
    if (!token || !user || !days.length) return [];
    const wanted = new Set(days);
    // Keyed by day: adjacent windows overlap by a day at the edges.
    const rows = new Map<string, Row>();
    for (let i = 0; i < days.length; i += 30) {
        const chunk = days.slice(i, i + 30);
        const since = dayStartSec(chunk[0]);
        const until = dayStartSec(chunk[chunk.length - 1]) + 86400;
        const r = await fetch(`${THREADS}/${user}/threads_insights?metric=views&since=${since}&until=${until}&access_token=${token}`, { cache: 'no-store' });
        const j = await r.json();
        for (const v of j?.data?.[0]?.values || []) {
            // end_time marks the END of the day (midnight PT), so the day it
            // covers is the calendar date one day earlier.
            const day = dayKey(new Date(Date.parse(v.end_time) - DAY_MS));
            if (wanted.has(day)) rows.set(day, { day, platform: 'threads', views: Number(v.value) || 0 });
        }
    }
    return [...rows.values()];
}

/** Collect + store every platform for the given days. Each platform fails independently. */
export async function collectDailyViews(days: string[]): Promise<Record<string, number | string>> {
    const result: Record<string, number | string> = {};
    const jobs: [string, () => Promise<Row[]>][] = [
        ['website', () => collectWebsite(days)],
        ['instagram', () => collectInstagram(days)],
        ['threads', () => collectThreads(days)],
    ];
    await Promise.all(jobs.map(async ([name, run]) => {
        try {
            const rows = await run();
            await upsert(rows);
            result[name] = rows.length;
        } catch (e: any) {
            result[name] = `error: ${e?.message || e}`;
        }
    }));
    return result;
}

/** Refresh the last `n` days (today included, since today keeps growing). */
export function refreshRecentDailyViews(n = 3) {
    const today = dayKey(new Date());
    const from = dayKey(new Date(Date.now() - (n - 1) * DAY_MS));
    return collectDailyViews(daysBetween(from, today));
}

// ── Reader ─────────────────────────────────────────────────────────────────

export interface ViewsDay { day: string; label: string; website: number; instagram: number; threads: number; x: number; total: number; }
export interface ViewsSummary {
    series: ViewsDay[];
    totals: Record<ViewPlatform, number> & { total: number };
    prevTotals: (Record<ViewPlatform, number> & { total: number }) | null; // previous equal-length period, null for all-time
    hasData: Record<ViewPlatform, boolean>;
    since: string;
}

const zero = () => ({ website: 0, instagram: 0, threads: 0, x: 0, total: 0 });

/** Views per day for the range (0 = all time) plus the previous period for deltas. */
export async function getViewsSummary(rangeDays: number): Promise<ViewsSummary> {
    const today = dayKey(new Date());
    // All time starts at the first stored day.
    let since: string;
    if (rangeDays === 0) {
        const { data } = await supabaseAdmin.from('daily_views').select('day').gt('views', 0).order('day', { ascending: true }).limit(1);
        since = data?.[0]?.day || dayKey(new Date(Date.now() - 29 * DAY_MS));
    } else {
        since = dayKey(new Date(Date.now() - (rangeDays - 1) * DAY_MS));
    }
    const prevFrom = rangeDays === 0 ? null : dayKey(new Date(Date.parse(`${since}T00:00:00Z`) - rangeDays * DAY_MS));

    const { data, error } = await supabaseAdmin
        .from('daily_views')
        .select('day, platform, views')
        .gte('day', prevFrom || since)
        .lte('day', today)
        .limit(20000);
    if (error) throw new Error(`daily_views read: ${error.message}`);

    const byDay = new Map<string, ViewsDay>();
    for (const day of daysBetween(since, today)) {
        const d = new Date(`${day}T00:00:00Z`);
        byDay.set(day, { day, label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }), ...zero() });
    }
    const totals = zero();
    const prev = zero();
    const hasData = { website: false, instagram: false, threads: false, x: false };
    for (const r of data || []) {
        const p = r.platform as ViewPlatform;
        if (!VIEW_PLATFORMS.includes(p)) continue;
        const v = Number(r.views) || 0;
        const row = byDay.get(r.day);
        if (row) {
            row[p] += v; row.total += v;
            totals[p] += v; totals.total += v;
            hasData[p] = true;
        } else if (prevFrom && r.day < since) {
            prev[p] += v; prev.total += v;
        }
    }
    return { series: [...byDay.values()], totals, prevTotals: prevFrom ? prev : null, hasData, since };
}
