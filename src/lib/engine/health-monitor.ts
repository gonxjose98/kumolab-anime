// Aggregated system-health check used by both the dashboard widget
// and the alert cron. Returns structured status per subsystem so the
// UI can render red/yellow/green dots and the cron can decide whether
// to fire a push notification.

import { supabaseAdmin } from '../supabase/admin';
import { checkMetaTokenHealth } from './token-health';
import { PLATFORM_KEYS, retryCapFor } from './engine';

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

// Where health alerts go when neither HEALTH_ALERT_WEBHOOK nor
// HEALTH_ALERT_EMAIL is configured. Hardcoded on purpose: an alerting system
// that needs configuration before it can warn you is one that stays silent
// exactly when it matters, which is what happened here. Override with
// HEALTH_ALERT_EMAIL.
const HEALTH_ALERT_FALLBACK_EMAIL = 'gonxjose98@gmail.com';

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
        // 60s timeout absorbs Render free-tier cold starts (dyno sleeps
        // after 15 min idle, 30-60s to spin back up). Anything past 60s
        // is a real outage.
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 60_000);
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
    // Posts that hit auto-retry exhaustion (still no socials). Matches the
    // publisher's generic retry: any recent non-DROP published post that never
    // got a platform ID and has burned its attempts. (The old check only
    // counted `skipped_reason='video_fetch_failed'`, so any other
    // orphaned-post failure class was invisible here.)
    //
    // The cap is per-cause and comes from `retryCapFor` rather than a literal,
    // because video-fetch failures stop at 2 to conserve proxy bandwidth. A
    // hardcoded `>= 5` here would silently never flag them.
    const { data } = await supabaseAdmin
        .from('posts')
        .select('id, title, social_ids')
        .eq('status', 'published')
        .neq('type', 'DROP')
        .gte('published_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
        .limit(200);

    const stuck = (data || []).filter((p) => {
        const sid: any = p.social_ids || {};
        const hasPlatform = PLATFORM_KEYS.some((k) => !!sid[k]);
        const attempts = (sid.publish_attempts as number) || 0;
        return !hasPlatform && attempts >= retryCapFor(sid);
    });
    const n = stuck.length;
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

async function checkStore(): Promise<HealthCheck> {
    // The money path is invisible until it breaks. The documented failure mode
    // is a missing key after an env reset (Stripe placeholder → every checkout
    // errors; no Printful token → merch page renders empty, orders can't be
    // fulfilled). Cheap presence checks catch exactly that, with no external
    // call / rate-limit exposure every tick.
    const hasStripe = !!process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_placeholder';
    const hasPrintful = !!process.env.PRINTFUL_ACCESS_TOKEN;

    if (!hasStripe && !hasPrintful) {
        return { key: 'store', label: 'Store', level: 'crit', detail: 'Stripe + Printful keys both missing — checkout and fulfilment are down', actionable: 'Set STRIPE_SECRET_KEY + PRINTFUL_ACCESS_TOKEN in Vercel' };
    }
    if (!hasStripe) {
        return { key: 'store', label: 'Store', level: 'crit', detail: 'STRIPE_SECRET_KEY missing/placeholder — every checkout will fail', actionable: 'Set STRIPE_SECRET_KEY in Vercel' };
    }
    if (!hasPrintful) {
        return { key: 'store', label: 'Store', level: 'crit', detail: 'PRINTFUL_ACCESS_TOKEN missing — paid orders can’t reach Printful', actionable: 'Set PRINTFUL_ACCESS_TOKEN in Vercel' };
    }
    return { key: 'store', label: 'Store', level: 'ok', detail: 'Stripe + Printful configured' };
}

/**
 * Threads token rotation. Nothing watched this before, so a failed rotation
 * was invisible until posting simply stopped at day 60.
 *
 * There's no cheap Threads equivalent of Meta's debug_token, so instead of
 * probing the token we watch whether ROTATION is succeeding: refreshThreadsToken
 * now writes to error_logs when it can't persist a new token. A failure inside
 * the last two cron cycles (weekly, so 15 days) means the clock is running down
 * with no rotation happening.
 */
async function checkThreadsToken(): Promise<HealthCheck> {
    if (!process.env.THREADS_ACCESS_TOKEN) {
        return { key: 'threads_token', label: 'Threads Token', level: 'ok', detail: 'Not configured' };
    }
    const since = new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString();
    const { data } = await supabaseAdmin
        .from('error_logs')
        .select('error_message, created_at')
        .eq('source', 'threads-token.refresh')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1);

    const latest = data?.[0];
    if (latest) {
        return {
            key: 'threads_token',
            label: 'Threads Token',
            level: 'crit',
            detail: `Rotation failing since ${new Date(latest.created_at).toISOString().slice(0, 10)}: ${String(latest.error_message).slice(0, 120)}`,
            actionable: 'Threads tokens die 60 days after issue. Re-mint and set THREADS_ACCESS_TOKEN, and check VERCEL_TOKEN has not expired',
        };
    }
    return { key: 'threads_token', label: 'Threads Token', level: 'ok', detail: 'Rotating cleanly' };
}

/**
 * Staleness of the hand-curated `anime_tiers` list.
 *
 * This is the check that would have caught the 2026-07-30 stall. The list is
 * edited by hand and nothing refreshes it; as it ages, more posts miss it and
 * score 0/40 on Franchise. There is now an AniList popularity fallback so a
 * stale list no longer drives auto-publishing to zero, but it still degrades
 * targeting, and a curated list nobody has touched in weeks is worth surfacing.
 *
 * Thresholds come from the observed incident: the list went stale enough to
 * stall the pipeline at 13 days, so warn before that and crit past it.
 */
async function checkTierListFreshness(): Promise<HealthCheck> {
    const { data } = await supabaseAdmin
        .from('anime_tiers')
        .select('updated_at')
        .eq('active', true)
        .order('updated_at', { ascending: false })
        .limit(1);

    const newest = data?.[0]?.updated_at;
    if (!newest) {
        return {
            key: 'tier_list',
            label: 'Anime Tiers',
            level: 'crit',
            detail: 'No active tier entries',
            actionable: 'Add current-season shows at /admin/engine — every post will fall back to AniList popularity',
        };
    }
    const days = Math.floor((Date.now() - new Date(newest).getTime()) / 86_400_000);
    if (days >= 21) {
        return {
            key: 'tier_list',
            label: 'Anime Tiers',
            level: 'crit',
            detail: `Not updated in ${days} days`,
            actionable: 'The weekly refresh-tiers cron should hold this under 7 days — check its last run before adding shows by hand at /admin/engine',
        };
    }
    if (days >= 10) {
        return {
            key: 'tier_list',
            label: 'Anime Tiers',
            level: 'warn',
            detail: `Not updated in ${days} days`,
            actionable: 'The weekly refresh-tiers cron should hold this under 7 days — check its last run before adding shows by hand at /admin/engine',
        };
    }
    return { key: 'tier_list', label: 'Anime Tiers', level: 'ok', detail: `Updated ${days}d ago` };
}

/**
 * Object-storage usage. The July 2026 outage that restricted the whole project
 * API was a bucket filling up, and nothing watched buckets.
 *
 * This lives here rather than relying on the cleanup worker's error_logs row
 * because checkErrors() only crits at 10+ errors/hour — a single daily storage
 * warning would never have tripped it, which is exactly how the last one went
 * unnoticed.
 */
async function checkStorage(): Promise<HealthCheck> {
    const { data, error } = await supabaseAdmin.rpc('storage_bytes_by_bucket');
    if (error || !data) {
        return { key: 'storage', label: 'Storage', level: 'warn', detail: 'Size probe unavailable' };
    }
    const rows = data as { bucket_id: string; bytes: number; objects: number }[];
    const total = rows.reduce((s, r) => s + (Number(r.bytes) || 0), 0);
    const gb = total / 1024 ** 3;
    const biggest = [...rows].sort((a, b) => Number(b.bytes) - Number(a.bytes))[0];
    const detail = `${gb.toFixed(2)} GB${biggest ? ` (largest: ${biggest.bucket_id})` : ''}`;

    // Pro includes 100 GB. These fire on runaway growth, long before billing:
    // ~2.7 GB/month flows in at current 1080p volume, so 8 GB means the sweep
    // is roughly three months behind.
    if (gb >= 12) {
        return { key: 'storage', label: 'Storage', level: 'crit', detail, actionable: 'Purge old objects; check the cleanup worker is sweeping and that studio-library is not unbounded' };
    }
    if (gb >= 8) {
        return { key: 'storage', label: 'Storage', level: 'warn', detail, actionable: 'Growth outpacing the cleanup sweep — review bucket retention' };
    }
    return { key: 'storage', label: 'Storage', level: 'ok', detail };
}

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
    const checks = await Promise.all([
        checkWorker(),
        checkCronFreshness(),
        checkBreaker(),
        checkStuckPosts(),
        checkPublishCadence(),
        checkMetaToken(),
        checkThreadsToken(),
        checkTierListFreshness(),
        checkStorage(),
        checkErrors(),
        checkStore(),
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
    // ── What changed since last run ─────────────────────────────
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
        // Fire when we move INTO warn/crit, or recover OUT of warn/crit.
        if (c.level !== prior && (c.level !== 'ok' || (prior && prior !== 'ok'))) {
            transitions.push({ check: c, from: prior });
        }
    }

    const persist = () => supabaseAdmin.from('worker_locks').upsert(
        {
            lock_key: 'health_state',
            locked_by: JSON.stringify(newState),
            locked_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        },
        { onConflict: 'lock_key' },
    );

    if (transitions.length === 0) {
        await persist();
        return { fired: 0, skipped: snap.checks.length };
    }

    // ── Deliver ─────────────────────────────────────────────────
    //
    // Webhook when one is configured, otherwise EMAIL. Email is a first-class
    // channel here, not a courtesy fallback: HEALTH_ALERT_WEBHOOK was never set
    // in Vercel (confirmed 2026-07-31 — 58 env vars, not among them), so every
    // check in this file computed correctly and then reached nobody. That is how
    // a stale tier list stalled publishing for two days with no warning.
    // Requiring a Slack or Discord account made the alerting path harder to set
    // up than the system it watches. Resend is already configured with a
    // verified domain, so email costs no new account and no new credential.
    const webhook = process.env.HEALTH_ALERT_WEBHOOK;
    let fired = 0;

    if (webhook) {
        for (const t of transitions) {
            const c = t.check;
            try {
                const res = await fetch(webhook, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ text: alertText(c) }),
                });
                // A dead Slack/Discord URL returns 4xx rather than throwing, so
                // catching only exceptions counted a rejected POST as delivered.
                if (res.ok) fired++;
                else await noteAlertFailure('webhook returned ' + res.status, c);
            } catch (e: any) {
                await noteAlertFailure('webhook threw: ' + (e?.message || e), c);
            }
        }
    } else {
        fired = await emailAlerts(transitions.map(t => t.check));
    }

    await persist();
    return { fired, skipped: snap.checks.length - transitions.length };
}

function alertText(c: HealthCheck): string {
    const emoji = c.level === 'crit' ? '\u{1F534}' : c.level === 'warn' ? '\u{1F7E1}' : '✅';
    const verb = c.level === 'ok' ? 'recovered' : 'changed';
    return `${emoji} *KumoLab — ${c.label}* ${verb}\n${c.detail}${c.actionable ? `\n→ ${c.actionable}` : ''}`;
}

/**
 * Record that an alert could not be delivered.
 *
 * Rate-limited to one row a day: this worker runs every 30 minutes, and
 * flooding error_logs would trip checkErrors()'s 10-per-hour threshold, burying
 * the real fault under noise about the alerter itself.
 */
async function noteAlertFailure(reason: string, c: HealthCheck): Promise<void> {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await supabaseAdmin
        .from('error_logs')
        .select('id', { count: 'exact', head: true })
        .eq('source', 'health-monitor.alert-undelivered')
        .gte('created_at', since);
    if (count) return;
    await supabaseAdmin.from('error_logs').insert({
        source: 'health-monitor.alert-undelivered',
        error_message: `Health alert could not be delivered (${reason}). Alerting is effectively off.`,
        context: { check: c.key, level: c.level, detail: c.detail },
    }).then(() => {}, () => {});
}

/**
 * Email the transitions via Resend. Returns how many were actually accepted.
 *
 * Recipient: HEALTH_ALERT_EMAIL, falling back to the owner address. Routes
 * through noteAlertFailure when Resend is unconfigured so that "nobody can be
 * reached" is still recorded rather than silently swallowed.
 */
async function emailAlerts(checks: HealthCheck[]): Promise<number> {
    const to = process.env.HEALTH_ALERT_EMAIL || HEALTH_ALERT_FALLBACK_EMAIL;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || !to) {
        await noteAlertFailure(apiKey ? 'no alert recipient configured' : 'RESEND_API_KEY not set and no webhook configured', checks[0]);
        return 0;
    }
    const worst = checks.some(c => c.level === 'crit') ? 'CRITICAL'
        : checks.some(c => c.level === 'warn') ? 'Warning' : 'Recovered';
    const subject = `KumoLab health: ${worst} — ${checks.map(c => c.label).join(', ')}`;
    const body = checks.map(c => {
        const tag = c.level === 'crit' ? '[CRIT]' : c.level === 'warn' ? '[WARN]' : '[OK]';
        return `${tag} ${c.label}\n${c.detail}${c.actionable ? `\nAction: ${c.actionable}` : ''}`;
    }).join('\n\n');
    try {
        const { Resend } = await import('resend');
        const { error } = await new Resend(apiKey).emails.send({
            from: 'KumoLab Health <news@kumolabanime.com>',
            to,
            subject,
            text: `${body}\n\n---\nAdmin dashboard: https://kumolabanime.com/admin/dashboard`,
        });
        if (error) {
            await noteAlertFailure(`Resend rejected: ${error.message}`, checks[0]);
            return 0;
        }
        return checks.length;
    } catch (e: any) {
        await noteAlertFailure(`Resend threw: ${e?.message || e}`, checks[0]);
        return 0;
    }
}

function safeParse(s: string): Record<string, HealthLevel> {
    try {
        const v = JSON.parse(s);
        return v && typeof v === 'object' ? v : {};
    } catch {
        return {};
    }
}
