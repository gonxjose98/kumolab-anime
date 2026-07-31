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

/**
 * KumoLab's PROJECT goals — deliberately distinct from the APEX global goals.
 *
 * An AI agent picking up work on KumoLab needs to know what this project is
 * trying to do, which is not the same question as what the umbrella business is
 * trying to do. Surfaced in the Engine brief popup alongside the posting
 * formula.
 *
 * Read-only in the UI. Edit the `project_goals` row in engine_config to change
 * them; no deploy needed. The defaults below are the fallback so the panel
 * renders before anyone has written that row.
 */
export async function getProjectGoals(): Promise<FormulaElement[]> {
    return readKey<FormulaElement[]>('project_goals', DEFAULT_GOALS);
}

const DEFAULT_GOALS: FormulaElement[] = [
    {
        title: 'Revenue before tooling',
        detail: 'KumoLab has been at $0. Sponsorships and the merch drop are the priority; new work should '
            + 'default to revenue, not more automation. AdSense is deferred — traffic is too low to justify it.',
    },
    {
        title: 'Anime only',
        detail: 'Not live action, not games, not reviews or reaction content. Off-topic candidates are '
            + 'rejected at ingestion. Note the keyword lists cannot block "gacha", "switch" or "game" — '
            + 'those appear in real anime titles.',
    },
    {
        title: 'Quality over volume',
        detail: 'Tripling post volume HALVED total views. The top 10% of posts earn 83.5% of them. '
            + 'Hold 2-3 reels a day and protect the peak slots for the highest-ceiling content.',
    },
    {
        title: 'The winning formula',
        detail: 'Known franchise + trailer or season news + video + Friday-to-Monday, 7-8am ET. '
            + 'Automate the formula rather than changing the output by hand.',
    },
    {
        title: 'Fail loudly, not silently',
        detail: 'KumoLab breaks by going stale, not by throwing. A tier list nobody updated stalled '
            + 'publishing for two days with no error anywhere. Anything that can decay needs a freshness '
            + 'check that reaches a human.',
    },
    {
        title: 'The operator is one person',
        detail: 'Every automation must degrade to something Jose can understand and correct in a few '
            + 'minutes. A clever system nobody can debug at 2am is worse than a plain one.',
    },
];

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
