/**
 * circuit-breaker.ts
 *
 * Guard against runaway bad auto-publishes. If KumoLab posts get deleted by
 * admin or expire under suspicious conditions within a short window of publishing,
 * the circuit trips and auto-publish pauses. Jose manually resets.
 *
 * Uses worker_locks as a simple state holder (lock_key='auto_publish_paused'
 * with expires_at = paused_until).
 *
 * Triggering signal: N declined posts in 24h, where each decline happened
 * within 24h of the post's original publish. We count from action_logs
 * action='declined' joined with the post's published_at window.
 */

import { supabaseAdmin } from '../supabase/admin';
import { AUTOMATION } from './automation-config';

const LOCK_KEY = 'auto_publish_paused';

export async function isAutoPublishPaused(): Promise<{ paused: boolean; reason?: string; pausedUntil?: string }> {
    const { data } = await supabaseAdmin
        .from('worker_locks')
        .select('lock_key, locked_by, expires_at')
        .eq('lock_key', LOCK_KEY)
        .maybeSingle();

    if (!data) return { paused: false };

    // Expired pause? Caller can still observe it, but cleanup_stale_locks will sweep.
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return { paused: false };
    }

    return { paused: true, reason: data.locked_by || 'unknown', pausedUntil: data.expires_at || undefined };
}

/**
 * Counts decline events in the last CIRCUIT_BREAKER_WINDOW_HOURS. If over threshold,
 * trips the breaker by inserting a worker_locks row. Returns true if the breaker
 * tripped on THIS check.
 */
export async function evaluateCircuitBreaker(): Promise<{ tripped: boolean; corrections: number }> {
    const windowHours = AUTOMATION.CIRCUIT_BREAKER_WINDOW_HOURS;
    const threshold = AUTOMATION.CIRCUIT_BREAKER_THRESHOLD;
    const since = new Date(Date.now() - windowHours * 3600 * 1000).toISOString();

    const { count } = await supabaseAdmin
        .from('action_logs')
        .select('*', { count: 'exact', head: true })
        .eq('action', 'declined')
        .gte('created_at', since);

    const corrections = count ?? 0;
    if (corrections < threshold) return { tripped: false, corrections };

    // Already paused? Don't double-insert.
    const existing = await isAutoPublishPaused();
    if (existing.paused) return { tripped: false, corrections };

    const pausedUntil = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    await supabaseAdmin.from('worker_locks').upsert(
        {
            lock_key: LOCK_KEY,
            locked_by: `circuit_breaker: ${corrections} declines in ${windowHours}h`,
            locked_at: new Date().toISOString(),
            expires_at: pausedUntil,
        },
        { onConflict: 'lock_key' }
    );

    await supabaseAdmin.from('error_logs').insert({
        source: 'circuit-breaker',
        error_message: `Auto-publish paused: ${corrections} declines in ${windowHours}h (threshold ${threshold})`,
        context: { corrections, threshold, pausedUntil },
    });

    return { tripped: true, corrections };
}

export async function manualResetCircuitBreaker(actor: string = 'admin'): Promise<void> {
    await supabaseAdmin.from('worker_locks').delete().eq('lock_key', LOCK_KEY);
    await supabaseAdmin.from('action_logs').insert({
        action: 'circuit_breaker_reset',
        actor,
        reason: 'manual reset',
        created_at: new Date().toISOString(),
    });
}
