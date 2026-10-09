/**
 * System report for Explore: the ops facts that used to crowd the dashboard
 * (health checks, source health, recent errors, scraper activity, token
 * expiries), gathered in one place for the System pill + drawer.
 *
 * Everything here is deterministic. Server-only.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { getHealthSnapshot, type HealthSnapshot } from '@/lib/engine/health-monitor';
import { getTokenStatuses, surfacedTokens, reminderText, type TokenStatus } from './tokens';

export interface SystemSource {
    source_name: string;
    source_type: string | null;
    health_score: number | null;
    consecutive_failures: number | null;
    is_enabled: boolean | null;
    last_success: string | null;
}

export interface SystemError {
    id: string;
    source: string | null;
    error_message: string | null;
    created_at: string;
}

export interface SystemActivity {
    decision: string | null;
    source_name: string | null;
    candidate_title: string | null;
    created_at: string;
}

export interface NeedsYouItem {
    key: string;
    text: string;
    level: 'warn' | 'crit';
    /** 'token' items are deterministic expiry reminders. */
    kind: 'token' | 'health' | 'sources';
}

export interface SystemReport {
    checkedAt: string;
    health: HealthSnapshot;
    tokens: TokenStatus[];
    needsYou: NeedsYouItem[];
    sources: SystemSource[];
    sourcesHealthy: number;
    errors24h: number;
    errors: SystemError[];
    activity: SystemActivity[];
}

// Health keys whose facts the token rows already cover with real dates.
const COVERED_BY_TOKENS = new Set(['meta_token', 'threads_token']);

export async function getSystemReport(): Promise<SystemReport> {
    const since24 = new Date(Date.now() - 24 * 3600_000).toISOString();
    const [health, tokens, srcRes, errCount, errRes, actRes] = await Promise.all([
        getHealthSnapshot().catch((e): HealthSnapshot => ({
            overall: 'crit',
            checks: [{ key: 'health', label: 'Health monitor', level: 'crit', detail: `Snapshot failed: ${String(e?.message ?? e).slice(0, 120)}` }],
            checkedAt: new Date().toISOString(),
        })),
        getTokenStatuses().catch(() => [] as TokenStatus[]),
        supabaseAdmin.from('source_health').select('source_name, source_type, health_score, consecutive_failures, is_enabled, last_success').order('source_name', { ascending: true }),
        supabaseAdmin.from('error_logs').select('id', { count: 'exact', head: true }).gte('created_at', since24),
        supabaseAdmin.from('error_logs').select('id, source, error_message, created_at').gte('created_at', since24).order('created_at', { ascending: false }).limit(12),
        // Skip the duplicate re-sightings: they are 97% of rows and say nothing.
        supabaseAdmin.from('scraper_logs').select('decision, source_name, candidate_title, created_at').neq('decision', 'rejected_duplicate').order('created_at', { ascending: false }).limit(12),
    ]);

    const sources = (srcRes.data || []) as SystemSource[];
    const enabled = sources.filter((s) => s.is_enabled !== false);
    const sourcesHealthy = enabled.filter((s) => (s.consecutive_failures ?? 0) === 0).length;

    const needsYou: NeedsYouItem[] = [];
    for (const t of surfacedTokens(tokens)) {
        needsYou.push({ key: `token:${t.key}`, text: reminderText(t), level: t.level === 'crit' ? 'crit' : 'warn', kind: 'token' });
    }
    for (const c of health.checks) {
        if (c.level !== 'crit' || COVERED_BY_TOKENS.has(c.key)) continue;
        needsYou.push({ key: `health:${c.key}`, text: `${c.label}: ${c.detail}`, level: 'crit', kind: 'health' });
    }
    const failing = enabled.filter((s) => (s.consecutive_failures ?? 0) >= 3);
    if (failing.length >= 3) {
        needsYou.push({ key: 'sources', text: `${failing.length} sources failing repeatedly`, level: 'warn', kind: 'sources' });
    }

    return {
        checkedAt: new Date().toISOString(),
        health,
        tokens,
        needsYou,
        sources,
        sourcesHealthy,
        errors24h: errCount.count ?? 0,
        errors: (errRes.data || []) as SystemError[],
        activity: (actRes.data || []) as SystemActivity[],
    };
}

/** Token facts only (no slow health probes). Used by the cron snapshot. */
export async function getTokenSnapshot() {
    const tokens = await getTokenStatuses({ fresh: true });
    return tokens.map(({ key, level, expiresAt, daysLeft, window, detail }) => ({ key, level, expiresAt, daysLeft, window, detail }));
}
