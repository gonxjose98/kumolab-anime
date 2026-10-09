/**
 * Dashboard "Needs you" token alerts.
 *
 * Reads the deterministic token snapshot the Explore / AI Insights cron stores
 * on explore_runs.system_snapshot (dates come from platform APIs, never a
 * model). No live probes here, so the dashboard stays fast. A snapshot older
 * than 30 hours is ignored rather than shown stale.
 */
import { supabaseAdmin } from '@/lib/supabase/admin';

export interface TokenAlert {
    key: string;
    text: string;
    detail: string;
    level: 'warn' | 'crit';
}

interface SnapToken {
    key: string;
    level: string;
    daysLeft: number | null;
    window: number | null;
    detail: string;
}

const NAME: Record<string, string> = {
    meta: 'Meta token',
    threads: 'Threads token',
    youtube: 'YouTube connection',
    vercel: 'Vercel token',
    x: 'X keys',
    anthropic: 'Claude API key',
};

export function tokenAlertText(t: SnapToken): string {
    const name = NAME[t.key] || t.key;
    if (t.daysLeft == null) return `${name} needs attention`;
    if (t.daysLeft <= 0) return `${name} has expired`;
    return `${name} expires in ${t.daysLeft} day${t.daysLeft === 1 ? '' : 's'}`;
}

/** Tokens inside a reminder window or broken, soonest first. */
export function alertsFromSnapshot(snap: unknown): TokenAlert[] {
    if (!Array.isArray(snap)) return [];
    return (snap as SnapToken[])
        .filter((t) => t && (t.window != null || t.level === 'crit'))
        .sort((a, b) => (a.daysLeft ?? -1) - (b.daysLeft ?? -1))
        .map((t) => ({ key: t.key, text: tokenAlertText(t), detail: String(t.detail || ''), level: t.level === 'crit' || (t.daysLeft != null && t.daysLeft <= 7) ? 'crit' : 'warn' }));
}

export async function getTokenAlerts(): Promise<TokenAlert[]> {
    const since = new Date(Date.now() - 30 * 3600_000).toISOString();
    const { data } = await supabaseAdmin
        .from('explore_runs')
        .select('system_snapshot, started_at')
        .not('system_snapshot', 'is', null)
        .gte('started_at', since)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    return alertsFromSnapshot(data?.system_snapshot);
}
