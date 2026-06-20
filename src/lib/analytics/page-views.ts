import { supabaseAdmin } from '@/lib/supabase/admin';

export interface TrafficRow {
    label: string;
    views: number;
}

export interface WebsiteTraffic {
    ok: boolean;
    reason?: string;
    views30d: number;
    views7d: number;
    botViews30d: number;
    topPaths: TrafficRow[];
    topReferrers: TrafficRow[];
}

const EMPTY: WebsiteTraffic = {
    ok: false,
    views30d: 0,
    views7d: 0,
    botViews30d: 0,
    topPaths: [],
    topReferrers: [],
};

/**
 * Reads website traffic from `page_views` (service role — RLS-only DB).
 * Aggregates in JS over the last-30d rows. Volume is low today; if it ever
 * grows past tens of thousands of rows per 30d, move this to a SQL aggregate
 * or a Postgres RPC.
 */
export async function fetchWebsiteTraffic(): Promise<WebsiteTraffic> {
    try {
        const now = Date.now();
        const since30 = new Date(now - 30 * 86_400_000).toISOString();
        const since7 = new Date(now - 7 * 86_400_000).toISOString();

        const { data: rows, error } = await supabaseAdmin
            .from('page_views')
            .select('path, referrer, timestamp, is_bot')
            .gte('timestamp', since30)
            .order('timestamp', { ascending: false })
            .limit(50_000);

        if (error) return { ...EMPTY, reason: error.message };

        const all = rows || [];
        const human = all.filter((r) => !r.is_bot);
        const botViews30d = all.length - human.length;
        const views7d = human.filter((r) => (r.timestamp as string) >= since7).length;

        const pathCounts = new Map<string, number>();
        const refCounts = new Map<string, number>();
        for (const r of human) {
            const p = (r.path as string) || '(unknown)';
            pathCounts.set(p, (pathCounts.get(p) || 0) + 1);
            const ref = normalizeReferrer(r.referrer as string | null);
            if (ref) refCounts.set(ref, (refCounts.get(ref) || 0) + 1);
        }

        const topPaths = toSortedRows(pathCounts).slice(0, 8);
        const topReferrers = toSortedRows(refCounts).slice(0, 8);

        return { ok: true, views30d: human.length, views7d, botViews30d, topPaths, topReferrers };
    } catch (e: unknown) {
        return { ...EMPTY, reason: e instanceof Error ? e.message : 'page_views fetch failed' };
    }
}

function toSortedRows(counts: Map<string, number>): TrafficRow[] {
    return [...counts.entries()]
        .map(([label, views]) => ({ label, views }))
        .sort((a, b) => b.views - a.views);
}

function normalizeReferrer(ref: string | null): string | null {
    if (!ref) return null; // direct / none — not shown as a source
    try {
        const host = new URL(ref).hostname.replace(/^www\./, '');
        return host || null;
    } catch {
        return ref.slice(0, 60);
    }
}
