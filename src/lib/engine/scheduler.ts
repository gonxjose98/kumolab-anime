/**
 * scheduler.ts — v2
 *
 * Assigns a scheduled publish time to an auto-approved post using a 3-lane model:
 *   - BREAKING: detected_at < 2h ago + time-sensitive claim → publish immediately (next few min)
 *   - STANDARD: paced through platform peak-hour windows, respecting per-platform daily caps
 *   - FILL: last-resort slot, only considered if STANDARD queue was light
 *
 * Caps, windows, and diversity rules live in automation-config.ts.
 *
 * Returns a scheduled_at (ISO) that the caller puts on the post. Phase 4 will use
 * this to drive per-platform broadcasts; v1 still posts to FB+IG at publish time,
 * but the time itself is scheduled by this module.
 */

import { supabaseAdmin } from '../supabase/admin';
import {
    PLATFORM_PEAK_WINDOWS,
    BREAKING_CLAIM_TYPES,
    BREAKING_MAX_AGE_MINUTES,
    DIVERSITY,
    Lane,
    Platform,
} from './automation-config';

export interface SchedulerInput {
    detected_at?: string;
    claim_type?: string | null;
    source_tier?: number;
    source?: string;
    anime_id?: string | number | null;
    isT1YouTube: boolean;
}

export interface ScheduledAssignment {
    lane: Lane;
    scheduled_at: string;     // ISO
    platforms: Platform[];    // platforms the post should broadcast to (Phase 4)
    reason: string;
}

// ── ET-clock helpers ───────────────────────────────────────────
function etHour(date: Date): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hour: 'numeric', hour12: false,
    }).formatToParts(date);
    return parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
}

function inWindow(hour: number, windows: Array<[number, number]>): boolean {
    for (const [start, end] of windows) {
        if (start <= end) {
            if (hour >= start && hour < end) return true;
        } else {
            // Wrap-around window (e.g. 22..4)
            if (hour >= start || hour < end) return true;
        }
    }
    return false;
}

// ── Platform targeting ─────────────────────────────────────────
// 'instagram' here represents the entire Meta surface (IG + FB + Threads) because
// Meta Suite cross-posts from IG automatically. Never fan out to FB or Threads directly.
function targetPlatforms(isT1YouTube: boolean, claimType: string | null | undefined): Platform[] {
    const base: Platform[] = ['website'];
    // Trailers go everywhere: website + X + Meta cross-post + TikTok + YT Shorts.
    if (isT1YouTube || claimType === 'TRAILER_DROP') {
        return [...base, 'x', 'instagram', 'tiktok', 'youtube_shorts'];
    }
    // Visual drops: strong fit for IG/X, skip video-first platforms.
    if (claimType === 'NEW_KEY_VISUAL') {
        return [...base, 'x', 'instagram'];
    }
    // News (dates, seasons, staff) — text-friendly destinations.
    return [...base, 'x', 'instagram'];
}

// ── Lane classifier ────────────────────────────────────────────
function classifyLane(input: SchedulerInput): Lane {
    const claim = (input.claim_type || '').toUpperCase();
    if (!BREAKING_CLAIM_TYPES.has(claim)) return 'STANDARD';
    const detectedAt = input.detected_at ? new Date(input.detected_at).getTime() : 0;
    if (!detectedAt) return 'STANDARD';
    const ageMinutes = (Date.now() - detectedAt) / 60000;
    return ageMinutes <= BREAKING_MAX_AGE_MINUTES ? 'BREAKING' : 'STANDARD';
}

// ── Slot finder ────────────────────────────────────────────────
async function recentScheduledSlots(nowUtc: Date, lookAheadHours: number = 48): Promise<Date[]> {
    const endBound = new Date(nowUtc.getTime() + lookAheadHours * 3600 * 1000).toISOString();
    const { data } = await supabaseAdmin
        .from('posts')
        .select('scheduled_post_time')
        .eq('status', 'approved')
        .not('scheduled_post_time', 'is', null)
        .gte('scheduled_post_time', nowUtc.toISOString())
        .lte('scheduled_post_time', endBound);
    return (data || [])
        .map(r => (r.scheduled_post_time ? new Date(r.scheduled_post_time) : null))
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime());
}

// Find the next slot that:
//   - falls within the website's peak-hour window (broadest — website cadence gates the others)
//   - is at least DIVERSITY.MIN_GAP_MINUTES after the prior scheduled slot
//   - is in the future
async function findStandardSlot(nowUtc: Date): Promise<Date> {
    const existing = await recentScheduledSlots(nowUtc);
    const minGapMs = DIVERSITY.MIN_GAP_MINUTES * 60 * 1000;

    let candidate = new Date(nowUtc);
    candidate.setSeconds(0, 0);
    // Start at the next 5-min boundary
    candidate.setMinutes(Math.ceil(candidate.getMinutes() / 5) * 5);
    // Plus a 15-min buffer so we're not racing a cron that fires every hour
    candidate = new Date(candidate.getTime() + 15 * 60 * 1000);

    // Walk forward, respecting peak window + gap
    for (let i = 0; i < 72 * 12; i++) { // up to 72h in 5-min steps
        const hour = etHour(candidate);
        if (inWindow(hour, PLATFORM_PEAK_WINDOWS.x)) {
            // Respect min gap from any existing slot
            const collision = existing.find(e => Math.abs(e.getTime() - candidate.getTime()) < minGapMs);
            if (!collision) return candidate;
        }
        candidate = new Date(candidate.getTime() + 5 * 60 * 1000);
    }

    // Fallback: schedule at nowUtc + 1 hour
    return new Date(nowUtc.getTime() + 3600 * 1000);
}

// ── Public entry point ────────────────────────────────────────
export async function assignScheduledSlot(input: SchedulerInput): Promise<ScheduledAssignment> {
    const now = new Date();
    const lane = classifyLane(input);
    const platforms = targetPlatforms(input.isT1YouTube, input.claim_type);

    if (lane === 'BREAKING') {
        // Schedule 3 minutes out so revalidation + social broadcasts don't race the insert.
        const slot = new Date(now.getTime() + 3 * 60 * 1000);
        return {
            lane,
            scheduled_at: slot.toISOString(),
            platforms,
            reason: `BREAKING: ${input.claim_type || 'unknown'} < ${BREAKING_MAX_AGE_MINUTES}m old`,
        };
    }

    // STANDARD: daily caps removed per Jose. Spacing is enforced by findStandardSlot
    // via DIVERSITY.MIN_GAP_MINUTES. Posts flow freely; spacing protects algo health.
    const slot = await findStandardSlot(now);
    return {
        lane,
        scheduled_at: slot.toISOString(),
        platforms,
        reason: `STANDARD: queued at ET hour ${etHour(slot)}`,
    };
}
