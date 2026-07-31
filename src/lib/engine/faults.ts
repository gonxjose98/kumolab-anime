/**
 * faults.ts — one merged, spatial view of everything currently wrong.
 *
 * Three independent fault sources become one `Fault[]`:
 *
 *   1. HEALTH   — the 11 health-monitor checks, read from the CACHED snapshot
 *                 that the health-monitor cron persists into
 *                 `engine_config.health_snapshot`.
 *   2. ERROR    — `error_logs` from the last 24h, grouped by `source`.
 *   3. STUCK    — published posts that burned their retries and never reached
 *                 a single platform, each with its exact republish URL.
 *
 * The important field is `nodeId`. It joins a fault to a node on the blueprint
 * graph, which is what lets the UI focus the broken part of the map and lets an
 * agent reading the state API say WHERE the system broke rather than only that
 * it did. Resolution is best-effort by design: an unmapped error source
 * degrades to a fault with no node, it never throws.
 *
 * WHY THE CACHE: `getHealthSnapshot()` runs eleven checks including a network
 * call to the Render worker with a 60-second timeout. It is fine in a cron and
 * completely unusable on a page render, so this module never calls it. It reads
 * whatever the cron last wrote and reports how old that is. If the row does not
 * exist yet (nothing has written it, or the writer regressed), this returns no
 * health faults and `healthAgeMinutes: null` rather than failing the page.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { PLATFORM_KEYS, retryCapFor } from '@/lib/engine/engine';
import { nodeForErrorSource, nodeForHealthKey } from '@/lib/engine/blueprint';
import type { HealthCheck, HealthLevel, HealthSnapshot } from './health-monitor';

export type FaultLevel = HealthLevel; // 'ok' | 'warn' | 'crit'

export interface Fault {
    /** Stable identity, so the UI can key rows and an agent can diff runs. */
    key: string;
    level: FaultLevel;
    label: string;
    detail: string;
    actionable?: string;
    /** Blueprint node that owns this fault, when it can be resolved. */
    nodeId?: string;
    /** Where a human goes to fix it. */
    href?: string;
    source: 'health' | 'error' | 'stuck';
}

export interface FaultReport {
    faults: Fault[];
    /** Age of the cached health snapshot, or null when nothing has written it. */
    healthAgeMinutes: number | null;
}

/** The engine_config key the health-monitor cron writes its snapshot into. */
export const HEALTH_SNAPSHOT_KEY = 'health_snapshot';

/**
 * Health checks we deliberately drop from the merge because sources 2 and 3
 * compute a strictly better version of the same thing, live:
 *
 *   - `errors` is a single "N errors in the last hour" aggregate; the error
 *     source below groups 24h of errors BY source and resolves each group to a
 *     node, so keeping both would show the same incident twice, once without a
 *     location.
 *   - `stuck` is a count; the stuck source below emits one actionable fault per
 *     post, carrying the post title and its republish URL.
 */
const SUPERSEDED_HEALTH_KEYS = new Set(['errors', 'stuck']);

const LEVEL_RANK: Record<FaultLevel, number> = { crit: 0, warn: 1, ok: 2 };

const DAY_MS = 24 * 60 * 60 * 1000;

function clip(s: unknown, n = 140): string {
    const t = String(s ?? '').replace(/\s+/g, ' ').trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

// ── 1. Health ───────────────────────────────────────────────────

async function healthFaults(): Promise<{ faults: Fault[]; ageMinutes: number | null }> {
    let row: { value: unknown; updated_at?: string | null } | null = null;
    try {
        const { data, error } = await supabaseAdmin
            .from('engine_config')
            .select('value, updated_at')
            .eq('key', HEALTH_SNAPSHOT_KEY)
            .maybeSingle();
        if (error) return { faults: [], ageMinutes: null };
        row = (data as any) ?? null;
    } catch {
        return { faults: [], ageMinutes: null };
    }

    const snap = row?.value as HealthSnapshot | undefined;
    if (!snap || !Array.isArray(snap.checks)) return { faults: [], ageMinutes: null };

    // `engine_config.updated_at` has no auto-update trigger, so the writer sets
    // it explicitly. Fall back to the snapshot's own checkedAt if it did not.
    const stamp = row?.updated_at || snap.checkedAt || null;
    const t = stamp ? new Date(stamp).getTime() : NaN;
    const ageMinutes = Number.isFinite(t)
        ? Math.max(0, Math.floor((Date.now() - t) / 60_000))
        : null;

    const faults: Fault[] = [];
    for (const c of snap.checks as HealthCheck[]) {
        if (!c || !c.key || SUPERSEDED_HEALTH_KEYS.has(c.key)) continue;
        const node = safeNode(() => nodeForHealthKey(c.key));
        faults.push({
            key: `health.${c.key}`,
            level: (c.level ?? 'ok') as FaultLevel,
            label: c.label || c.key,
            detail: c.detail || '',
            ...(c.actionable ? { actionable: c.actionable } : {}),
            ...(node ? { nodeId: node.id } : {}),
            source: 'health',
        });
    }
    return { faults, ageMinutes };
}

// ── 2. Errors ───────────────────────────────────────────────────

async function errorFaults(): Promise<Fault[]> {
    let rows: { source: string | null; error_message: string | null; created_at: string }[] = [];
    try {
        const { data, error } = await supabaseAdmin
            .from('error_logs')
            .select('source, error_message, created_at')
            .gte('created_at', new Date(Date.now() - DAY_MS).toISOString())
            .order('created_at', { ascending: false })
            .limit(500);
        if (error || !data) return [];
        rows = data as any;
    } catch {
        return [];
    }

    // Grouped by source. Rows arrive newest-first, so the first message seen for
    // a group IS the most recent one.
    const groups = new Map<string, { count: number; latest: string; at: string }>();
    for (const r of rows) {
        const src = r?.source || 'unknown';
        const g = groups.get(src);
        if (g) g.count++;
        else groups.set(src, { count: 1, latest: clip(r?.error_message), at: r?.created_at });
    }

    const out: Fault[] = [];
    for (const [src, g] of groups) {
        // Same thresholds checkErrors() uses, so "error rate" means one thing.
        const level: FaultLevel = g.count >= 10 ? 'crit' : g.count >= 4 ? 'warn' : 'ok';
        const node = safeNode(() => nodeForErrorSource(src));
        out.push({
            key: `error.${src}`,
            level,
            label: src,
            detail: `${g.count} error${g.count === 1 ? '' : 's'} in 24h${g.latest ? ` · latest: ${g.latest}` : ''}`,
            ...(level === 'ok' ? {} : { actionable: 'Inspect error_logs for this source' }),
            ...(node ? { nodeId: node.id } : {}),
            href: '/admin/dashboard',
            source: 'error',
        });
    }
    return out;
}

// ── 3. Stuck posts ──────────────────────────────────────────────

async function stuckFaults(): Promise<Fault[]> {
    let rows: { id: string; title: string | null; social_ids: any }[] = [];
    try {
        // Mirrors checkStuckPosts() in health-monitor.ts exactly: a recent
        // non-DROP published post that never got a platform ID and has burned
        // the per-cause retry cap. The cap comes from retryCapFor, not a
        // literal, because video-fetch failures stop at 2 to conserve proxy
        // bandwidth and a hardcoded 5 would never flag them.
        const { data, error } = await supabaseAdmin
            .from('posts')
            .select('id, title, social_ids')
            .eq('status', 'published')
            .neq('type', 'DROP')
            .gte('published_at', new Date(Date.now() - DAY_MS).toISOString())
            .limit(200);
        if (error || !data) return [];
        rows = data as any;
    } catch {
        return [];
    }

    // No node declares healthKey 'stuck', so fall back to the node that owns the
    // publishing path — that is where a stuck post is actually fixed.
    const node = safeNode(() => nodeForHealthKey('stuck')) ?? safeNode(() => nodeForErrorSource('publisher'));

    const out: Fault[] = [];
    for (const p of rows) {
        const sid: any = p?.social_ids || {};
        if (PLATFORM_KEYS.some((k) => !!sid[k])) continue;
        const attempts = (sid.publish_attempts as number) || 0;
        if (attempts < retryCapFor(sid)) continue;
        out.push({
            key: `stuck.${p.id}`,
            level: 'crit',
            label: 'Stuck post',
            detail: `"${clip(p.title || p.id, 70)}" — ${attempts} attempt${attempts === 1 ? '' : 's'}, never reached a platform`,
            actionable: 'Republish this post, or delete it if the video is permanently broken',
            ...(node ? { nodeId: node.id } : {}),
            href: `/api/cron?worker=republish-social&postIds=${p.id}`,
            source: 'stuck',
        });
    }
    return out;
}

// ── Merge ───────────────────────────────────────────────────────

/** Node lookup must never be able to fail the whole report. */
function safeNode<T>(fn: () => T | null): T | null {
    try {
        return fn() ?? null;
    } catch {
        return null;
    }
}

export async function getFaults(): Promise<FaultReport> {
    const [health, errors, stuck] = await Promise.all([
        healthFaults(),
        errorFaults(),
        stuckFaults(),
    ]);

    const faults = [...health.faults, ...errors, ...stuck]
        .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);

    return { faults, healthAgeMinutes: health.ageMinutes };
}
