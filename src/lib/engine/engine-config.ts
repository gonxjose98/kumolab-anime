// engine-config.ts
//
// The pipeline's human-editable operating rules (the posting formula and the
// peak time slots), read from the engine_config table. This is the canonical
// spec both the /admin/engine tab and any AI agent should follow + verify
// against. Plus a read of the live scheduled queue (mirrors what Content →
// Schedule holds, read-only). All server-side via supabaseAdmin.

import { supabaseAdmin } from '@/lib/supabase/admin';
import type { PostScore } from './scoring';

export interface FormulaElement {
    title: string;
    detail: string;
}

export interface PeakSlot {
    label: string;
    time: string;   // "HH:MM" in ET (24h)
    region: string;
    note: string;
}

// Defaults mirror the seed, so the UI still renders if a row is missing.
const DEFAULT_FORMULA: FormulaElement[] = [
    { title: 'Franchise / tier', detail: 'A tracked anime, prioritized by its tier. Higher tier = higher priority.' },
    { title: 'Category', detail: 'Trailer drop or season announcement. Not key visuals, not cast additions.' },
    { title: 'Format', detail: 'Video, with motion in the first frame. No static-image reels.' },
    { title: 'Timing', detail: 'Publish in one of the 3 peak slots, weighted to Friday through Monday.' },
    { title: 'Volume', detail: '2-3 reels per day. Quality over volume.' },
    { title: 'Hook', detail: 'First 1.5s: franchise name plus the stakes on screen. End with a comment prompt.' },
];

const DEFAULT_SLOTS: PeakSlot[] = [
    { label: 'Slot 1', time: '07:30', region: 'Japan · evening prime', note: '8:30pm JST.' },
    { label: 'Slot 2', time: '13:00', region: 'US + Mexico · daytime', note: 'US lunch, Mexico late morning.' },
    { label: 'Slot 3', time: '21:30', region: 'Mexico + US · evening', note: 'The Americas evening.' },
];

async function readKey<T>(key: string, fallback: T): Promise<T> {
    try {
        const { data, error } = await supabaseAdmin
            .from('engine_config').select('value').eq('key', key).maybeSingle();
        if (error || !data?.value) return fallback;
        return data.value as T;
    } catch {
        return fallback;
    }
}

export async function getPostFormula(): Promise<FormulaElement[]> {
    return readKey<FormulaElement[]>('post_formula', DEFAULT_FORMULA);
}

export async function getPeakSlots(): Promise<PeakSlot[]> {
    return readKey<PeakSlot[]>('peak_slots', DEFAULT_SLOTS);
}

/** Persist the full peak-slot array (the admin edits one time, sends all three). */
export async function savePeakSlots(slots: PeakSlot[]): Promise<{ ok: boolean; reason?: string }> {
    if (!Array.isArray(slots) || slots.length === 0) return { ok: false, reason: 'no slots' };
    // Validate HH:MM 24h.
    for (const s of slots) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time || '')) {
            return { ok: false, reason: `invalid time "${s?.time}" (use HH:MM, 24h ET)` };
        }
    }
    const { error } = await supabaseAdmin
        .from('engine_config')
        .upsert({ key: 'peak_slots', value: slots, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    return error ? { ok: false, reason: error.message } : { ok: true };
}

// ── Live scheduled queue (read-only mirror of Content → Schedule) ─────────────

export interface ScheduledItem {
    id: string;
    title: string;
    claim_type: string | null;
    /** ISO slot time, or null for a STANDBY pool candidate awaiting selection. */
    scheduled_post_time: string | null;
    post_score: number | null;
    score_breakdown: PostScore | null;
}

/**
 * Upcoming approved posts, soonest first: slot-booked posts by time, then the
 * standby pool (scheduled_post_time NULL — waiting for a peak slot) sorted by
 * current score. Each row carries post_score + score_breakdown for the Engine
 * tab's SCORE column and click-to-see popup.
 */
export async function getScheduledQueue(limit = 40): Promise<ScheduledItem[]> {
    try {
        const nowIso = new Date().toISOString();
        const { data, error } = await supabaseAdmin
            .from('posts')
            .select('id, title, claim_type, scheduled_post_time, post_score, score_breakdown')
            .eq('status', 'approved')
            .or(`scheduled_post_time.gte.${nowIso},scheduled_post_time.is.null`)
            .order('scheduled_post_time', { ascending: true, nullsFirst: false })
            .limit(limit);
        if (error || !data) return [];
        return data as ScheduledItem[];
    } catch {
        return [];
    }
}
