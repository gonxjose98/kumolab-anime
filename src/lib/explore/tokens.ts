/**
 * Token expiry reminders for the Explore > System drawer.
 *
 * DETERMINISTIC ON PURPOSE. Every date here comes from a platform API or a
 * stored row, never from a model, so a reminder is always correct. The AI may
 * summarize system state elsewhere, but it never produces these facts.
 *
 * Server-only: reads secret env vars. Nothing in the returned objects contains
 * a token value; provider error strings are scrubbed before they leave here.
 */

import { supabaseAdmin } from '@/lib/supabase/admin';
import { checkMetaTokenHealth } from '@/lib/engine/token-health';

export type TokenLevel = 'ok' | 'warn' | 'crit' | 'unknown' | 'missing';

export interface TokenStatus {
    key: string;
    label: string;
    level: TokenLevel;
    /** ISO date the credential (or its data window) stops working; null = no fixed expiry or unknown. */
    expiresAt: string | null;
    daysLeft: number | null;
    /** The reminder window this falls in (30, 14, 7, 3, 2, 1, or 0 = expired). null = not in a window. */
    window: number | null;
    detail: string;
    action?: string;
}

/** Reminder thresholds, in days. A token reaches the main surface only inside one of these. */
export const REMINDER_THRESHOLDS = [30, 14, 7, 3, 2, 1] as const;

const DAY_MS = 86_400_000;

/** Whole days until `expiresAtMs`, floored (so "1 day" means under 48h left). */
export function daysUntil(expiresAtMs: number, nowMs = Date.now()): number {
    return Math.floor((expiresAtMs - nowMs) / DAY_MS);
}

/**
 * Smallest threshold that `daysLeft` has reached. 29 days -> 30, 10 -> 14,
 * 3 -> 3, 0 or below -> 0 (expired / expiring today). Over 30 -> null.
 */
export function reminderWindow(daysLeft: number | null): number | null {
    if (daysLeft === null || !Number.isFinite(daysLeft)) return null;
    if (daysLeft <= 0) return 0;
    let hit: number | null = null;
    for (const t of REMINDER_THRESHOLDS) if (daysLeft <= t) hit = t;
    return hit;
}

export function levelForDays(daysLeft: number | null): TokenLevel {
    if (daysLeft === null) return 'ok';
    if (daysLeft <= 7) return 'crit';
    if (daysLeft <= 30) return 'warn';
    return 'ok';
}

/** Strip anything that looks like a credential from a provider message. */
export function scrub(s: unknown): string {
    return String(s ?? '')
        .replace(/[A-Za-z0-9_\-|.]{28,}/g, '[redacted]')
        .slice(0, 160);
}

function withDates(base: Omit<TokenStatus, 'expiresAt' | 'daysLeft' | 'window' | 'level'>, expiresAtMs: number | null, nowMs: number): TokenStatus {
    if (expiresAtMs === null) {
        return { ...base, level: 'ok', expiresAt: null, daysLeft: null, window: null };
    }
    const daysLeft = daysUntil(expiresAtMs, nowMs);
    return {
        ...base,
        level: levelForDays(daysLeft),
        expiresAt: new Date(expiresAtMs).toISOString(),
        daysLeft,
        window: reminderWindow(daysLeft),
    };
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 8000): Promise<{ status: number; json: any }> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' });
        const json = await res.json().catch(() => null);
        return { status: res.status, json };
    } finally {
        clearTimeout(t);
    }
}

/** Last refresh-cron outcome from worker_runs, for the "auto-rotation" note. */
async function lastRotation(worker: string): Promise<{ at: string; ok: boolean; reason: string } | null> {
    const { data } = await supabaseAdmin
        .from('worker_runs')
        .select('started_at, result')
        .eq('worker', worker)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (!data) return null;
    const r = (data.result || {}) as Record<string, unknown>;
    return { at: data.started_at as string, ok: r.success === true, reason: scrub(r.reason) };
}

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });

// ── Individual checks ───────────────────────────────────────────────────────

async function metaToken(nowMs: number): Promise<TokenStatus> {
    const base = { key: 'meta', label: 'Meta (Instagram + Facebook)' };
    if (!process.env.META_ACCESS_TOKEN) {
        return { ...base, level: 'missing', expiresAt: null, daysLeft: null, window: null, detail: 'META_ACCESS_TOKEN is not set', action: 'Set META_ACCESS_TOKEN in Vercel' };
    }
    const h = await checkMetaTokenHealth().catch((e) => ({ ok: false, reason: String(e?.message || e) } as const));
    if (!h.ok) {
        return { ...base, level: 'crit', expiresAt: null, daysLeft: null, window: 0, detail: `Token check failed: ${scrub(h.reason)}`, action: 'Re-mint the token in Graph Explorer and set META_ACCESS_TOKEN' };
    }
    // Two clocks: the token itself (0 = never for page tokens) and the
    // data-access window. Whichever ends first is the real deadline.
    const tokenMs = 'expiresAt' in h && h.expiresAt ? h.expiresAt * 1000 : null;
    const dataMs = 'dataAccessExpiresAt' in h && h.dataAccessExpiresAt ? h.dataAccessExpiresAt * 1000 : null;
    const candidates = [tokenMs, dataMs].filter((x): x is number => x !== null);
    const deadline = candidates.length ? Math.min(...candidates) : null;
    const parts = [
        tokenMs ? `Token expires ${fmtDay(new Date(tokenMs).toISOString())}` : 'Token never expires',
        dataMs ? `data access ends ${fmtDay(new Date(dataMs).toISOString())}` : null,
    ].filter(Boolean);
    const rot = await lastRotation('refresh-meta-token').catch(() => null);
    if (rot && !rot.ok) parts.push(`weekly auto-refresh failing (${rot.reason})`);
    return withDates({
        ...base,
        detail: parts.join('; '),
        action: 'Re-authorize in Graph Explorer, exchange for a long-lived token, set META_ACCESS_TOKEN in Vercel',
    }, deadline, nowMs);
}

async function threadsToken(nowMs: number): Promise<TokenStatus> {
    const base = { key: 'threads', label: 'Threads' };
    const token = process.env.THREADS_ACCESS_TOKEN;
    if (!token) {
        return { ...base, level: 'missing', expiresAt: null, daysLeft: null, window: null, detail: 'THREADS_ACCESS_TOKEN is not set' };
    }
    // Threads exposes debug_token too; a user token may inspect itself.
    const url = `https://graph.threads.net/v1.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`;
    const rot = await lastRotation('refresh-threads-token').catch(() => null);
    const rotNote = rot && !rot.ok ? `; weekly auto-refresh reports a failure (${rot.reason})` : '';
    try {
        const { json } = await fetchJson(url);
        const d = json?.data;
        if (!d) {
            return { ...base, level: 'unknown', expiresAt: null, daysLeft: null, window: null, detail: `Could not read expiry: ${scrub(json?.error?.message || 'no data')}${rotNote}` };
        }
        if (d.is_valid === false) {
            return { ...base, level: 'crit', expiresAt: null, daysLeft: null, window: 0, detail: `Token is invalid${rotNote}`, action: 'Re-run the Threads OAuth flow (/api/oauth/threads) and set THREADS_ACCESS_TOKEN' };
        }
        const exp = typeof d.expires_at === 'number' && d.expires_at > 0 ? d.expires_at * 1000 : null;
        return withDates({
            ...base,
            detail: `${exp ? `Expires ${fmtDay(new Date(exp).toISOString())}` : 'No expiry reported'}${rotNote}`,
            action: 'Re-run the Threads OAuth flow (/api/oauth/threads) and set THREADS_ACCESS_TOKEN',
        }, exp, nowMs);
    } catch (e: any) {
        return { ...base, level: 'unknown', expiresAt: null, daysLeft: null, window: null, detail: `Expiry probe failed: ${scrub(e?.message || e)}${rotNote}` };
    }
}

async function youtubeToken(): Promise<TokenStatus> {
    const base = { key: 'youtube', label: 'YouTube upload (Google OAuth)' };
    const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret, YOUTUBE_REFRESH_TOKEN: refresh } = process.env;
    if (!refresh) return { ...base, level: 'missing', expiresAt: null, daysLeft: null, window: null, detail: 'YOUTUBE_REFRESH_TOKEN is not set (YouTube auto-upload off)' };
    if (!id || !secret) return { ...base, level: 'unknown', expiresAt: null, daysLeft: null, window: null, detail: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing, cannot verify' };
    // Google refresh tokens have no fixed expiry; they die when revoked or
    // unused for 6 months. A test exchange is the only honest check.
    try {
        const { status, json } = await fetchJson('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: 'refresh_token' }).toString(),
        });
        if (status === 200 && json?.access_token) {
            return { ...base, level: 'ok', expiresAt: null, daysLeft: null, window: null, detail: 'Valid. No fixed expiry (dies only if revoked or unused 6 months)' };
        }
        return { ...base, level: 'crit', expiresAt: null, daysLeft: null, window: 0, detail: `Refresh rejected: ${scrub(json?.error_description || json?.error || status)}`, action: 'Reconnect YouTube via the OAuth flow and set YOUTUBE_REFRESH_TOKEN' };
    } catch (e: any) {
        return { ...base, level: 'unknown', expiresAt: null, daysLeft: null, window: null, detail: `Check failed: ${scrub(e?.message || e)}` };
    }
}

function xKeys(): TokenStatus {
    const base = { key: 'x', label: 'X (OAuth 1.0a keys)' };
    const all = ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'].every((k) => !!process.env[k]);
    return all
        ? { ...base, level: 'ok', expiresAt: null, daysLeft: null, window: null, detail: 'Configured. These keys do not expire' }
        : { ...base, level: 'missing', expiresAt: null, daysLeft: null, window: null, detail: 'One or more X keys missing (X auto-post off)' };
}

/**
 * The Vercel token is what lets the Meta + Threads refresh crons SAVE a rotated
 * token. If it is dead, both rotations fail quietly, so it gets its own row.
 */
async function vercelToken(nowMs: number): Promise<TokenStatus> {
    const base = { key: 'vercel', label: 'Vercel API (saves rotated tokens)' };
    const token = process.env.VERCEL_TOKEN;
    if (!token) return { ...base, level: 'warn', expiresAt: null, daysLeft: null, window: null, detail: 'VERCEL_TOKEN not set, so Meta/Threads auto-refresh cannot save new tokens', action: 'Create a Vercel token and set VERCEL_TOKEN' };
    const auth = { headers: { Authorization: `Bearer ${token}` } };
    try {
        // The real test is the exact call the rotations make: list the project's env vars.
        const project = process.env.VERCEL_PROJECT_ID;
        if (project) {
            const team = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : '';
            const { status: envStatus } = await fetchJson(`https://api.vercel.com/v9/projects/${project}/env${team}`, auth);
            if (envStatus !== 200) {
                return { ...base, level: 'crit', expiresAt: null, daysLeft: null, window: 0, detail: `Vercel rejected the project env call (HTTP ${envStatus}). Meta/Threads auto-refresh cannot save new tokens`, action: 'Create a new Vercel token with access to this project and set VERCEL_TOKEN' };
            }
        }
        // Expiry, when the token type exposes it. A scoped token may 403 here; that alone is not a fault.
        const { status, json } = await fetchJson('https://api.vercel.com/v5/user/tokens/current', auth);
        const exp = status === 200 && typeof json?.token?.expiresAt === 'number' ? json.token.expiresAt : null;
        if (!project && status !== 200) {
            return { ...base, level: status === 401 || status === 403 ? 'crit' : 'unknown', expiresAt: null, daysLeft: null, window: status === 401 || status === 403 ? 0 : null, detail: `Vercel token check failed (HTTP ${status})`, action: 'Create a new Vercel token and set VERCEL_TOKEN' };
        }
        return withDates({
            ...base,
            detail: exp ? `Working. Expires ${fmtDay(new Date(exp).toISOString())}` : status === 200 ? 'Working. No expiry set' : 'Working. Expiry not readable for this token type',
            action: 'Create a new Vercel token and set VERCEL_TOKEN',
        }, exp, nowMs);
    } catch (e: any) {
        return { ...base, level: 'unknown', expiresAt: null, daysLeft: null, window: null, detail: `Check failed: ${scrub(e?.message || e)}` };
    }
}

function anthropicKey(): TokenStatus {
    const set = !!process.env.ANTHROPIC_API_KEY;
    return {
        key: 'anthropic', label: 'Claude API (Explore insights)',
        level: set ? 'ok' : 'missing', expiresAt: null, daysLeft: null, window: null,
        detail: set ? 'Configured. API keys do not expire' : 'ANTHROPIC_API_KEY not set, Explore insights are off',
        action: set ? undefined : 'Add ANTHROPIC_API_KEY in Vercel (Production) and redeploy',
    };
}

// ── Public ──────────────────────────────────────────────────────────────────

// Short in-process cache: the drawer and the cron both call this, and these
// are live network probes. Ten minutes keeps page loads quick without letting
// a reminder go stale.
let cache: { at: number; value: TokenStatus[] } | null = null;
const CACHE_MS = 10 * 60_000;

export async function getTokenStatuses(opts: { fresh?: boolean } = {}): Promise<TokenStatus[]> {
    if (!opts.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
    const now = Date.now();
    const settled = await Promise.allSettled([metaToken(now), threadsToken(now), youtubeToken(), vercelToken(now)]);
    const labels = ['meta', 'threads', 'youtube', 'vercel'];
    const live = settled.map((s, i): TokenStatus => s.status === 'fulfilled'
        ? s.value
        : { key: labels[i], label: labels[i], level: 'unknown', expiresAt: null, daysLeft: null, window: null, detail: `Check failed: ${scrub((s.reason as Error)?.message)}` });
    const value = [...live, xKeys(), anthropicKey()];
    cache = { at: Date.now(), value };
    return value;
}

/** Tokens that belong on the main surface: inside a reminder window, or broken. */
export function surfacedTokens(tokens: TokenStatus[]): TokenStatus[] {
    return tokens
        .filter((t) => t.window !== null || t.level === 'crit')
        .sort((a, b) => (a.daysLeft ?? -1) - (b.daysLeft ?? -1));
}

/** One-line reminder copy, e.g. "Meta (Instagram + Facebook): 29 days left (Nov 7, 2026)". */
export function reminderText(t: TokenStatus): string {
    if (t.daysLeft === null) return `${t.label}: needs attention`;
    if (t.daysLeft <= 0) return `${t.label}: expires today or has expired`;
    const when = t.expiresAt ? ` (${fmtDay(t.expiresAt)})` : '';
    return `${t.label}: ${t.daysLeft} day${t.daysLeft === 1 ? '' : 's'} left${when}`;
}
