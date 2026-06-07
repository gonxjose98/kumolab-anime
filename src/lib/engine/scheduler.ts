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
    isPremiumStudio,
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

// ── Posting hour grid (per Jose 2026-05-07) ─────────────────────
// Slot model: one post per hour, top of hour ET. 7 AM–11 PM ET window
// (16 hours/day), with strong preference for premium hours when picking.
//
//   PREMIUM_HOURS_ET — anime audience peak; IG rewards first-hour
//                      engagement most heavily during these windows.
//                      12 ET (lunch) + 17–22 ET (after-school + evening).
//   WINDOW_START_ET / WINDOW_END_ET — hard cap; nothing schedules outside.
//
// Decision flow when a post needs a slot:
//   1. Mark every hour in next 16 hours as open or claimed
//      (claimed = an existing post is already scheduled in that hour)
//   2. Filter to hours inside the 7–22 ET window
//   3. From open hours: prefer premium first, fall back to non-premium
//   4. Slot = top of hour ET (e.g. 18:00 ET, never 18:23 ET)
const PREMIUM_HOURS_ET = new Set([12, 17, 18, 19, 20, 21, 22]);
const WINDOW_START_ET = 7;
const WINDOW_END_ET = 23; // exclusive — last slot is 22:00 ET (10 PM)

/** Return a Date pinned to the top of the given ET hour, on the given UTC date. */
function topOfHourEt(refUtc: Date, hourEt: number, dayOffset: number = 0): Date {
    // Walk forward minute-by-minute from refUtc until we hit the desired
    // ET hour with minute=0. Easy and DST-safe (avoids manually computing
    // the ET offset for both standard time and DST).
    const start = new Date(refUtc);
    start.setUTCMinutes(0, 0, 0);
    // Add dayOffset days then walk hours
    start.setUTCHours(start.getUTCHours() + dayOffset * 24);
    for (let i = 0; i < 36; i++) {
        if (etHour(start) === hourEt) return start;
        start.setUTCHours(start.getUTCHours() + 1);
    }
    return start;
}

/** Bucket a Date to its ET hour-of-day key, e.g. "2026-05-07T18". */
function etHourKey(d: Date): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find(p => p.type === t)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}`;
}

// Find the next slot that:
//   - is in the 7-22 ET posting window
//   - is in an UN-CLAIMED hour (no existing scheduled post that hour)
//   - when preferPremium: prefers PREMIUM hours over non-premium
//   - when !preferPremium: takes the earliest OFF-PEAK hour first, so the
//     premium windows stay open for priority-studio content (Run 3,
//     2026-06-06). Falls back to premium only if no off-peak slot is open.
async function findStandardSlot(nowUtc: Date, preferPremium: boolean = true): Promise<Date> {
    const existing = await recentScheduledSlots(nowUtc);
    const claimedHours = new Set(existing.map(etHourKey));

    // Build a candidate list: every hour in the next 16 hours that
    // (a) sits inside the 7-22 ET window and (b) is in the future
    // by at least 15 min (so we're not racing the cron that fires
    // hourly).
    const minLeadMs = 15 * 60 * 1000;
    const horizon = 16 * 60 * 60 * 1000; // 16 hours ahead
    const horizonEnd = new Date(nowUtc.getTime() + horizon);

    const candidates: { slot: Date; hour: number; isPremium: boolean }[] = [];

    // Walk hour-by-hour starting at the current top-of-hour
    let walker = new Date(nowUtc);
    walker.setUTCMinutes(0, 0, 0);
    walker = new Date(walker.getTime() + 60 * 60 * 1000); // start at next top-of-hour
    while (walker.getTime() < horizonEnd.getTime()) {
        const hourEt = etHour(walker);
        const inWindow = hourEt >= WINDOW_START_ET && hourEt < WINDOW_END_ET;
        const futureEnough = walker.getTime() - nowUtc.getTime() >= minLeadMs;
        const claimed = claimedHours.has(etHourKey(walker));
        if (inWindow && futureEnough && !claimed) {
            candidates.push({
                slot: walker,
                hour: hourEt,
                isPremium: PREMIUM_HOURS_ET.has(hourEt),
            });
        }
        walker = new Date(walker.getTime() + 60 * 60 * 1000);
    }

    if (preferPremium) {
        // 1. First premium open slot wins
        const premium = candidates.find(c => c.isPremium);
        if (premium) return premium.slot;
        // 2. Otherwise the earliest open slot (non-premium)
        if (candidates.length > 0) return candidates[0].slot;
    } else {
        // 1. Reserve premium windows for priority studios: take the
        //    earliest OFF-PEAK open slot first.
        const offPeak = candidates.find(c => !c.isPremium);
        if (offPeak) return offPeak.slot;
        // 2. No off-peak open — fall back to the earliest open (premium).
        if (candidates.length > 0) return candidates[0].slot;
    }

    // 3. Last resort — no slots open in the next 16h. Fall through to
    // tomorrow's first premium hour. Avoids returning a slot inside
    // the off-hours.
    return topOfHourEt(nowUtc, 12, 1);
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
    //
    // Publish priority (Run 3, 2026-06-06): priority-studio posts (TOHO) claim
    // the premium peak-hour slots; everything else fills the off-peak pool
    // first, reserving high-first-hour-engagement windows for breakout-class
    // content. See PREMIUM_PUBLISH_STUDIOS in automation-config.ts.
    const preferPremium = isPremiumStudio(input.source);
    const slot = await findStandardSlot(now, preferPremium);
    return {
        lane,
        scheduled_at: slot.toISOString(),
        platforms,
        reason: `STANDARD: queued at ET hour ${etHour(slot)}${preferPremium ? ' (priority studio → premium)' : ' (off-peak pool)'}`,
    };
}
