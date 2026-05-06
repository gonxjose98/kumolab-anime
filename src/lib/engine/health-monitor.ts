// Aggregated system-health check used by both the dashboard widget
// and the alert cron. Returns structured status per subsystem so the
// UI can render red/yellow/green dots and the cron can decide whether
// to fire a push notification.

import { supabaseAdmin } from '../supabase/admin';
import { checkMetaTokenHealth } from './token-health';

export type HealthLevel = 'ok' | 'warn' | 'crit';

export interface HealthCheck {
    key: string;
    label: string;
    level: HealthLevel;
    detail: string;
    actionable?: string;
}

export interface HealthSnapshot {
    overall: HealthLevel;
    checks: HealthCheck[];
    checkedAt: string;
}

const WORKER_URL = process.env.YT_WORKER_URL;

const minutesAgo = (iso: string | null | undefined): number => {
    if (!iso) return Infinity;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
};

async function checkWorker(): Promise<HealthCheck> {
    if (!WORKER_URL) {
        return {
            key: 'worker',
            label: 'yt-dlp Worker',
            level: 'crit',
            detail: 'YT_WORKER_URL not configured',
        };
    }
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8_000);
        const res = await fetch(`${WORKER_URL.replace(/\/$/, '')}/healthz`, { signal: ctrl.signal });
        clearTimeout(t);
        const body = await res.json().catch(() => null);
        if (!res.ok || !body?.ok) {
            return {
                key: 'worker',
                label: 'yt-dlp Worker',
                level: 'crit',
                detail: `Worker unhealthy (HTTP ${res.status})`,
                actionable: 'Check Render dashboard / restart service',
            };
        }
        return {
            key: 'worker',
            label: 'yt-dlp Worker',
            level: 'ok',
            detail: `Online (${body.proxies ?? 0} proxies loaded)`,
        };
    } catch (e: any) {
        return {
            key: 'worker',
            label: 'yt-dlp Worker',
            level: 'crit',
            detail: `Unreachable: ${(e?.message || e).toString().slice(0, 80)}`,
            actionable: 'Render service may be sleeping or down',
        };
    }
}

async function checkCronFreshness(): Promise<HealthCheck> {
    // detection runs every 30 min — if scraper_logs hasn't moved in
    // 90 min something is wrong with the cron pipeline.
    const { data } = await supabaseAdmin
        .from('scraper_logs')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    const age = minutesAgo(data?.created_at);
    if (age > 120) {
        return {
            key: 'cron',
            label: 'Scraper',
            level: 'crit',
            detail: `Last run ${age === Infinity ? 'never' : age + ' min'} ago — cron may be broken`,
            actionable: 'Check Vercel cron logs',
        };
    }
    if (age > 60) {
        return {
            key: 'cron',
            label: 'Scraper',
            level: 'warn',
            detail: `Last run ${age} min ago (expected <60)`,
        };
    }
    return {
        key: 'cron',
        label: 'Scraper',
        level: 'ok',
        detail: `Last run ${age} min ago`,
    };
}

async function checkStuckPosts(): Promise<HealthCheck> {
    // Posts that hit auto-retry exhaustion (5 attempts, still no socials)
    const { data, count } = await supabaseAdmin
        .from('posts')
        .select('id, title', { count: 'exact' })
        .eq('status', 'published')
        .gte('published_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
        .filter('social_ids->>skipped_reason', 'eq', 'video_fetch_failed')
        .filter('social_ids->>publish_attempts', 'gte', '5')
        .limit(5);

    const n = count ?? data?.length ?? 0;
    if (n > 0) {
        return {
            key: 'stuck',
            label: 'Stuck Posts',
            level: 'crit',
            detail: `${n} post${n === 1 ? '' : 's'} exhausted retries (last 24h)`,
            actionable: 'Manual republish via /api/cron?worker=republish-social or delete',
        };
    }
    return {
        key: 'stuck',
        label: 'Stuck Posts',
        level: 'ok',
        detail: 'No retry-exhausted posts',
    };
}

async function checkPublishCadence(): Promise<HealthCheck> {
    // Compare last 24h published count vs prior 24h baseline.
    // If we're publishing way less than usual, something upstream is broken.
    const last24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const prior24 = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const [{ count: recent }, { count: prior }] = await Promise.all([
        supabaseAdmin.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'published').gte('published_at', last24),
        supabaseAdmin.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'published').gte('published_at', prior24).lt('published_at', last24),
    ]);
    const r = recent ?? 0;
    const p = prior ?? 0;
    if (r === 0 && p > 0) {
        return {
            key: 'cadence',
            label: 'Publish Cadence',
            level: 'crit',
            detail: `Zero posts in 24h (was ${p} the day before)`,
            actionable: 'Check circuit breaker, dedup, AI providers',
        };
    }
    if (p > 0 && r < p * 0.3) {
        return {
            key: 'cadence',
            label: 'Publish Cadence',
            level: 'warn',
            detail: `${r} posts in 24h, way below baseline of ${p}`,
        };
    }
    return {
        key: 'cadence',
        label: 'Publish Cadence',
        level: 'ok',
        detail: `${r} posts in last 24h`,
    };
}

async function checkBreaker(): Promise<HealthCheck> {
    const { data } = await supabaseAdmin
        .from('worker_locks')
        .select('locked_by, expires_at')
        .eq('lock_key', 'auto_publish_paused')
        .maybeSingle();
    if (data) {
        return {
            key: 'breaker',
            label: 'Circuit Breaker',
            level: 'crit',
            detail: `Tripped: ${data.locked_by}`,
            actionable: `Auto-resume at ${new Date(data.expires_at).toISOString()} or reset manually`,
        };
    }
    return {
        key: 'breaker',
        label: 'Circuit Breaker',
        level: 'ok',
        detail: 'Inactive (auto-publish flowing)',
    };
}

async function checkMetaToken(): Promise<HealthCheck> {
    const h = await checkMetaTokenHealth();
    if (!h.ok) {
        return {
            key: 'meta_token',
            label: 'Meta Token',
            level: 'crit',
            detail: h.reason ?? 'Token check failed',
            actionable: 'Re-mint via Graph Explorer (CLAUDE.md §12)',
        };
    }
    const days = h.daysUntilDataAccessExpiry;
    if (days !== null && days !== undefined) {
        if (days < 7) {
            return {
                key: 'meta_token',
                label: 'Meta Token',
                level: 'crit',
                detail: `${days} day${days === 1 ? '' : 's'} until data-access window closes`,
                actionable: 'Reauth Meta — IG calls will start returning empty data',
            };
        }
        if (days < 30) {
            return {
                key: 'meta_token',
                label: 'Meta Token',
                level: 'warn',
                detail: `${days} days until data-access window closes`,
            };
        }
    }
    return {
        key: 'meta_token',
        label: 'Meta Token',
        level: 'ok',
        detail: days !== null && days !== undefined ? `${days} days until refresh` : 'Valid',
    };
}

async function checkErrors(): Promise<HealthCheck> {
    const { count } = await supabaseAdmin
        .from('error_logs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
    const n = count ?? 0;
    if (n >= 10) {
        return {
            key: 'errors',
            label: 'Error Rate',
            level: 'crit',
            detail: `${n} errors in last hour`,
            actionable: 'Inspect error_logs',
        };
    }
    if (n >= 4) {
        return {
            key: 'errors',
            label: 'Error Rate',
            level: 'warn',
            detail: `${n} errors in last hour`,
        };
    }
    return {
        key: 'errors',
        label: 'Error Rate',
        level: 'ok',
        detail: `${n} error${n === 1 ? '' : 's'} in last hour`,
    };
}

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
    const checks = await Promise.all([
        checkWorker(),
        checkCronFreshness(),
        checkBreaker(),
        checkStuckPosts(),
        checkPublishCadence(),
        checkMetaToken(),
        checkErrors(),
    ]);

    const overall: HealthLevel = checks.some(c => c.level === 'crit')
        ? 'crit'
        : checks.some(c => c.level === 'warn')
            ? 'warn'
            : 'ok';

    return {
        overall,
        checks,
        checkedAt: new Date().toISOString(),
    };
}

// Push alerts via webhook (Slack / Discord / Telegram bot API / etc).
// Set HEALTH_ALERT_WEBHOOK to any URL that accepts a POST with JSON
// {"text": "..."} (Slack-compatible, also works for Discord with .../slack).
//
// To prevent alert spam, we only fire on STATE TRANSITIONS — if a check
// was crit last run and is still crit this run, we don't re-alert. State
// is persisted in the worker_locks table under lock_key='health_state'.
export async function fireHealthAlertsIfChanged(snap: HealthSnapshot): Promise<{ fired: number; skipped: number }> {
    const webhook = process.env.HEALTH_ALERT_WEBHOOK;
    if (!webhook) return { fired: 0, skipped: snap.checks.length };

    // Load previous state
    const { data: prev } = await supabaseAdmin
        .from('worker_locks')
        .select('locked_by')
        .eq('lock_key', 'health_state')
        .maybeSingle();
    const prevState: Record<string, HealthLevel> = prev?.locked_by ? safeParse(prev.locked_by) : {};

    const newState: Record<string, HealthLevel> = {};
    const transitions: { check: HealthCheck; from: HealthLevel | null }[] = [];

    for (const c of snap.checks) {
        newState[c.key] = c.level;
        const prior = prevState[c.key] ?? null;
        // Fire when we move INTO warn/crit, or recover OUT of warn/crit
        if (c.level !== prior && (c.level !== 'ok' || (prior && prior !== 'ok'))) {
            transitions.push({ check: c, from: prior });
        }
    }

    let fired = 0;
    for (const t of transitions) {
        const c = t.check;
        const emoji = c.level === 'crit' ? '🔴' : c.level === 'warn' ? '🟡' : '✅';
        const verb = c.level === 'ok' ? 'recovered' : 'changed';
        const text = `${emoji} *KumoLab — ${c.label}* ${verb}\n${c.detail}${c.actionable ? `\n→ ${c.actionable}` : ''}`;
        try {
            await fetch(webhook, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ text }),
            });
            fired++;
        } catch (e) {
            // Webhook itself failed — non-fatal, swallow
        }
    }

    // Persist new state
    await supabaseAdmin.from('worker_locks').upsert(
        {
            lock_key: 'health_state',
            locked_by: JSON.stringify(newState),
            locked_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        },
        { onConflict: 'lock_key' },
    );

    return { fired, skipped: snap.checks.length - transitions.length };
}

function safeParse(s: string): Record<string, HealthLevel> {
    try {
        const v = JSON.parse(s);
        return v && typeof v === 'object' ? v : {};
    } catch {
        return {};
    }
}
