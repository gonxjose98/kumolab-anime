/**
 * scheduler.ts — v3 (peak slots + standby pool)
 *
 * Jose's selection model (2026-07-17, ENGINE-SCORING-MODEL.md):
 *   • Post EXACTLY 3/day, one per peak slot. The 3 slots are the operator-
 *     editable engine_config `peak_slots` (ET "HH:MM", read via getPeakSlots).
 *   • Auto-approved posts NO LONGER claim a slot on arrival — they join a POOL
 *     (status='approved', scheduled_post_time=NULL). runSlotSelection() fills
 *     each upcoming peak slot with the highest CURRENT-scoring pooled
 *     candidate: recency is re-scored at selection time, so an aging standby
 *     decays and a big Tier-1 trailer can wait a day and still win.
 *   • After filling, the 3 next-best stay on standby for the following day;
 *     anything below the bar (<55) or fully aged (>48h) drops back to the
 *     review queue (status='pending') — nothing sits in the pool forever.
 *
 * assignScheduledSlot() remains for the manual approve flow (/api/admin/
 * approve): it books the next FREE peak slot directly, honoring the same
 * daily cap. Downstream publishing is untouched — publishScheduledPosts()
 * still fires on scheduled_post_time; pooled posts (NULL) simply don't
 * publish until selection books them into a slot.
 *
 * All slot timing is DST-safe: ET instants are found by walking UTC hours
 * against an America/New_York Intl clock (never a hardcoded offset). This
 * replaces the old strict-hourly grid and its hardcoded PREMIUM_HOURS_ET.
 */

import { supabaseAdmin } from '../supabase/admin';
import {
    BREAKING_CLAIM_TYPES,
    BREAKING_MAX_AGE_MINUTES,
    PLATFORM_DAILY_CAP,
    Lane,
    Platform,
} from './automation-config';
import { getPeakSlots } from './engine-config';
import {
    rescoreStored,
    scoreAgeHours,
    PostScore,
    SCORE_REVIEW_MIN,
    STANDBY_MAX_AGE_HOURS,
    STANDBY_POOL_SIZE,
} from './scoring';
import { logAction } from '../logging/structured-logger';

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

// ── ET-clock helpers (DST-safe via Intl, never a fixed offset) ──
function etHour(date: Date): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hour: 'numeric', hour12: false,
    }).formatToParts(date);
    return parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
}

/** The ET calendar day of an instant, e.g. "2026-07-17". */
function etDayKey(d: Date): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d);
    const get = (t: string) => parts.find(p => p.type === t)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * The UTC instant whose ET wall clock reads `hhmm` on (ET-today + dayOffset).
 * Walks UTC hours to find the matching ET hour (DST-safe), then adds the
 * minutes — the ET offset is always a whole number of hours, so the top of a
 * UTC hour is the top of an ET hour.
 */
function etSlotInstant(refUtc: Date, hhmm: string, dayOffset: number): Date | null {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm || '');
    if (!m) return null;
    const targetHour = parseInt(m[1], 10);
    const targetMin = parseInt(m[2], 10);
    const targetDay = etDayKey(new Date(refUtc.getTime() + dayOffset * 86_400_000));
    const w = new Date(refUtc);
    w.setUTCMinutes(0, 0, 0);
    w.setUTCHours(w.getUTCHours() - 30); // start a day+ back so today's earlier slots resolve too
    for (let i = 0; i < 72 + dayOffset * 24; i++) {
        if (etDayKey(w) === targetDay && etHour(w) === targetHour) {
            return new Date(w.getTime() + targetMin * 60_000);
        }
        w.setUTCHours(w.getUTCHours() + 1);
    }
    return null;
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

// ── Lane classifier (observability only — timing is slot-driven) ──
function classifyLane(input: SchedulerInput): Lane {
    const claim = (input.claim_type || '').toUpperCase();
    if (!BREAKING_CLAIM_TYPES.has(claim)) return 'STANDARD';
    const detectedAt = input.detected_at ? new Date(input.detected_at).getTime() : 0;
    if (!detectedAt) return 'STANDARD';
    const ageMinutes = (Date.now() - detectedAt) / 60000;
    return ageMinutes <= BREAKING_MAX_AGE_MINUTES ? 'BREAKING' : 'STANDARD';
}

// ── Concrete peak slots ────────────────────────────────────────

interface ConcreteSlot {
    at: Date;
    label: string;   // e.g. "Slot 2"
    etDay: string;   // ET calendar day the slot belongs to
}

// Don't book a slot less than 10 min out (racing the hourly publish cron),
// and treat any post scheduled within ±75 min of a slot as claiming it
// (covers legacy hourly-grid times that don't sit exactly on a slot).
const MIN_LEAD_MS = 10 * 60 * 1000;
const SLOT_EXCLUSION_MS = 75 * 60 * 1000;
// The selection step only books a slot when it is coming due (≤100 min out).
// Booking further ahead would pin a candidate a day early and defeat the
// model: each slot fills with the highest-scoring candidate available AT THAT
// MOMENT (fresh scrape vs re-scored standby). With selection running on every
// processing (:00) + publish (:05/:35) tick, each slot gets several booking
// opportunities inside this window.
const BOOKING_LOOKAHEAD_MS = 100 * 60 * 1000;

/** All future peak-slot instants over the next `days` ET days, soonest first. */
async function upcomingPeakSlots(nowUtc: Date, days: number): Promise<ConcreteSlot[]> {
    const slots = await getPeakSlots();
    const out: ConcreteSlot[] = [];
    for (let d = 0; d < days; d++) {
        for (const s of slots) {
            const at = etSlotInstant(nowUtc, s.time, d);
            if (at && at.getTime() - nowUtc.getTime() >= MIN_LEAD_MS) {
                out.push({ at, label: s.label, etDay: etDayKey(at) });
            }
        }
    }
    out.sort((a, b) => a.at.getTime() - b.at.getTime());
    return out;
}

/**
 * Current claims + per-ET-day post counts, so the cap (3/day) holds across
 * already-scheduled AND already-published posts. Daily Drops (type='DROP')
 * are website-only and don't consume social slots.
 */
async function loadSlotClaims(nowUtc: Date, horizon: Date): Promise<{ claims: Date[]; dayCounts: Map<string, number> }> {
    const claims: Date[] = [];
    const dayCounts = new Map<string, number>();
    const bump = (d: Date) => dayCounts.set(etDayKey(d), (dayCounts.get(etDayKey(d)) || 0) + 1);

    // FB-only key visuals (claim_type NEW_KEY_VISUAL) are a separate product —
    // they publish to Facebook only and must NEVER consume an IG peak slot or
    // count toward the 3/day IG cap. Exclude them here exactly like type='DROP'
    // (website-only Daily Drops). See assignFbOnlySlot for their own grid.
    const isFbOnly = (r: { type?: string | null; claim_type?: string | null }) =>
        r.type === 'DROP' || (r.claim_type || '').toUpperCase() === 'NEW_KEY_VISUAL';

    const { data: scheduled } = await supabaseAdmin
        .from('posts')
        .select('scheduled_post_time, type, claim_type')
        .eq('status', 'approved')
        .not('scheduled_post_time', 'is', null)
        .gte('scheduled_post_time', new Date(nowUtc.getTime() - 26 * 3_600_000).toISOString())
        .lte('scheduled_post_time', horizon.toISOString());
    for (const r of scheduled || []) {
        if (!r.scheduled_post_time || isFbOnly(r)) continue;
        const d = new Date(r.scheduled_post_time);
        claims.push(d);
        bump(d);
    }

    const { data: published } = await supabaseAdmin
        .from('posts')
        .select('published_at, type, claim_type')
        .eq('status', 'published')
        .neq('type', 'DROP')
        .gte('published_at', new Date(nowUtc.getTime() - 48 * 3_600_000).toISOString());
    for (const r of published || []) {
        if (r.published_at && !isFbOnly(r)) bump(new Date(r.published_at));
    }

    return { claims, dayCounts };
}

function slotIsFree(slot: ConcreteSlot, claims: Date[], dayCounts: Map<string, number>, cap: number): boolean {
    if ((dayCounts.get(slot.etDay) || 0) >= cap) return false;
    return !claims.some(c => Math.abs(c.getTime() - slot.at.getTime()) < SLOT_EXCLUSION_MS);
}

// ── Manual-approve entry point ─────────────────────────────────
/**
 * Books the next FREE peak slot (used by /api/admin/approve — an operator
 * approval claims a slot directly rather than joining the pool). Honors the
 * same 3/day cap and claimed-slot dedup as the selection step.
 */
export async function assignScheduledSlot(input: SchedulerInput): Promise<ScheduledAssignment> {
    const now = new Date();
    const lane = classifyLane(input);
    const platforms = targetPlatforms(input.isT1YouTube, input.claim_type);
    const cap = PLATFORM_DAILY_CAP.instagram;

    const slots = await upcomingPeakSlots(now, 7);
    const horizon = slots.length ? slots[slots.length - 1].at : new Date(now.getTime() + 7 * 86_400_000);
    const { claims, dayCounts } = await loadSlotClaims(now, horizon);

    const free = slots.find(s => slotIsFree(s, claims, dayCounts, cap));
    // Last resort (every slot for a week claimed): take the final slot anyway
    // rather than fail the approval — the operator asked for this post.
    const slot = free || slots[slots.length - 1];
    if (!slot) {
        // Peak slots unreadable — schedule top of the next hour as a safe fallback.
        const fallback = new Date(now);
        fallback.setUTCMinutes(0, 0, 0);
        fallback.setUTCHours(fallback.getUTCHours() + 1);
        return { lane, scheduled_at: fallback.toISOString(), platforms, reason: 'FALLBACK: peak slots unavailable' };
    }

    return {
        lane,
        scheduled_at: slot.at.toISOString(),
        platforms,
        reason: `PEAK ${slot.label} · ${slot.etDay} ET${lane === 'BREAKING' ? ' (was breaking)' : ''}${free ? '' : ' · all slots claimed, overflow'}`,
    };
}

// ── FB-only key-visual scheduling (separate from the IG peak slots) ──
// Key visuals are Facebook-only images (publisher's video-only-policy
// exception), a DIFFERENT product from the 3 IG video reels. They get their
// own off-peak hourly grid so they spread through the day, capped at
// FB_IMAGE_DAILY_CAP (default 3), and are kept ≥60 min away from every IG peak
// slot so the two products never share a moment. This grid does NOT read or
// write the IG slot claims/cap — the two tracks are fully independent.
const FB_KV_DAILY_CAP = Number(process.env.FB_IMAGE_DAILY_CAP ?? 3);
const FB_KV_WINDOW_START_ET = 9;
const FB_KV_WINDOW_END_ET = 22;   // exclusive — last FB-only slot is 21:00 ET
const FB_PEAK_AVOID_MS = 60 * 60 * 1000;

/** ET day+hour key, e.g. "2026-07-17T18". */
function etDayHourKey(d: Date): string {
    return `${etDayKey(d)}T${String(etHour(d)).padStart(2, '0')}`;
}

/**
 * Pick the next off-peak top-of-hour ET slot for a Facebook-only key visual:
 * inside the 9-22 ET window, ≥60 min from any IG peak slot, one per hour,
 * ≤FB_KV_DAILY_CAP per ET day (counting key visuals already scheduled). Falls
 * back to the next hour if the grid is somehow saturated for days — a key
 * visual should still ship rather than vanish. Returns an ISO string.
 */
export async function assignFbOnlySlot(nowUtc: Date = new Date()): Promise<string> {
    // Existing FB-only key-visual schedule → per-day counts + claimed hours.
    const horizon = new Date(nowUtc.getTime() + 4 * 86_400_000);
    const { data } = await supabaseAdmin
        .from('posts')
        .select('scheduled_post_time')
        .eq('status', 'approved')
        .eq('claim_type', 'NEW_KEY_VISUAL')
        .not('scheduled_post_time', 'is', null)
        .gte('scheduled_post_time', new Date(nowUtc.getTime() - 2 * 86_400_000).toISOString())
        .lte('scheduled_post_time', horizon.toISOString());
    const dayCounts = new Map<string, number>();
    const takenHours = new Set<string>();
    for (const r of data || []) {
        if (!r.scheduled_post_time) continue;
        const d = new Date(r.scheduled_post_time);
        dayCounts.set(etDayKey(d), (dayCounts.get(etDayKey(d)) || 0) + 1);
        takenHours.add(etDayHourKey(d));
    }

    // Peak-slot instants to steer clear of.
    const peaks = await upcomingPeakSlots(nowUtc, 4);

    // Walk top-of-hour ET candidates across the next 4 days.
    let w = new Date(nowUtc);
    w.setUTCMinutes(0, 0, 0);
    w = new Date(w.getTime() + 3_600_000); // next top-of-hour
    for (let i = 0; i < 4 * 24; i++, w = new Date(w.getTime() + 3_600_000)) {
        const hourEt = etHour(w);
        const inWindow = hourEt >= FB_KV_WINDOW_START_ET && hourEt < FB_KV_WINDOW_END_ET;
        const futureEnough = w.getTime() - nowUtc.getTime() >= MIN_LEAD_MS;
        const underCap = (dayCounts.get(etDayKey(w)) || 0) < FB_KV_DAILY_CAP;
        const hourFree = !takenHours.has(etDayHourKey(w));
        const nearPeak = peaks.some(p => Math.abs(p.at.getTime() - w.getTime()) < FB_PEAK_AVOID_MS);
        if (inWindow && futureEnough && underCap && hourFree && !nearPeak) {
            return w.toISOString();
        }
    }

    // Fallback: next hour (still off the IG slots — it's a key visual, FB-only).
    const fb = new Date(nowUtc);
    fb.setUTCMinutes(0, 0, 0);
    fb.setUTCHours(fb.getUTCHours() + 1);
    return fb.toISOString();
}

// ── Standby-pool selection (the 3/day backfill) ────────────────

export interface SlotSelectionResult {
    filled: number;
    standby: number;
    dropped: number;
}

interface PooledPost {
    id: string;
    title: string;
    post_score: number | null;
    score_breakdown: unknown;
}

/**
 * Fill each upcoming peak slot with the highest CURRENT-scoring pooled
 * candidate, then prune the pool to the 3 next-best standbys. Idempotent and
 * safe to run every cron tick (processing + publish both call it):
 *   • assignments use a compare-and-swap (status='approved' AND
 *     scheduled_post_time IS NULL), so overlapping runs can't double-book a post;
 *   • a slot already claimed (any approved post within ±75 min, or the ET day
 *     at its 3-post cap) is skipped.
 */
export async function runSlotSelection(): Promise<SlotSelectionResult> {
    const result: SlotSelectionResult = { filled: 0, standby: 0, dropped: 0 };
    const now = new Date();
    const cap = PLATFORM_DAILY_CAP.instagram;

    try {
        // 1. The pool: approved posts with no slot yet. FB-only key visuals are
        //    NEVER pooled (they get their own off-peak schedule at creation and
        //    always carry a scheduled_post_time), but exclude them explicitly so
        //    a NULL-time edge case can't leak a key visual into an IG slot.
        const { data: poolRows } = await supabaseAdmin
            .from('posts')
            .select('id, title, post_score, score_breakdown')
            .eq('status', 'approved')
            .is('scheduled_post_time', null)
            .neq('claim_type', 'NEW_KEY_VISUAL')
            .order('post_score', { ascending: false, nullsFirst: false })
            .limit(30);
        const pool = (poolRows || []) as PooledPost[];
        if (pool.length === 0) return result;

        // 2. Re-score every pooled candidate at the CURRENT time (recency decays).
        const candidates = pool.map(p => {
            const current = rescoreStored(p.score_breakdown, now);
            return {
                post: p,
                current,
                total: current ? current.total : (p.post_score ?? 0),
                ageHours: current ? scoreAgeHours(current, now) : 0,
            };
        });

        // 3. Slots coming due (within the booking lookahead), today + tomorrow
        //    enumerated so the day-cap accounting sees the whole picture.
        const allSlots = await upcomingPeakSlots(now, 2);
        const dueSlots = allSlots.filter(s => s.at.getTime() - now.getTime() <= BOOKING_LOOKAHEAD_MS);
        const horizon = allSlots.length ? allSlots[allSlots.length - 1].at : new Date(now.getTime() + 2 * 86_400_000);
        const { claims, dayCounts } = await loadSlotClaims(now, horizon);

        const assigned = new Set<string>();
        for (const slot of dueSlots) {
            if (!slotIsFree(slot, claims, dayCounts, cap)) continue;

            // Highest current score wins; must still be at least review-grade
            // and not fully aged out.
            const eligible = candidates
                .filter(c => !assigned.has(c.post.id))
                .filter(c => c.total >= SCORE_REVIEW_MIN && c.ageHours <= STANDBY_MAX_AGE_HOURS)
                .sort((a, b) => b.total - a.total);
            const best = eligible[0];
            if (!best) break;

            const update: Record<string, unknown> = { scheduled_post_time: slot.at.toISOString() };
            if (best.current) {
                update.post_score = best.current.total;
                update.score_breakdown = best.current;
            }
            // CAS: only book the post if it is still pooled (guards overlapping runs).
            const { data: booked, error } = await supabaseAdmin
                .from('posts')
                .update(update)
                .eq('id', best.post.id)
                .eq('status', 'approved')
                .is('scheduled_post_time', null)
                .select('id');
            assigned.add(best.post.id);
            if (error || !booked?.length) continue;

            claims.push(slot.at);
            dayCounts.set(slot.etDay, (dayCounts.get(slot.etDay) || 0) + 1);
            result.filled++;
            await logAction({
                action: 'scheduled',
                entityId: best.post.id,
                entityTitle: best.post.title,
                actor: 'Scheduler',
                reason: `peak-slot fill: ${slot.label} ${slot.at.toISOString()} (score ${best.total}/100)`,
            });
        }

        // 4. Prune the remainder: keep the 3 next-best standbys; everything
        //    aged out (>48h), below the bar (<55), or beyond the pool size
        //    drops back to review — pooled posts never sit forever.
        const remaining = candidates
            .filter(c => !assigned.has(c.post.id))
            .sort((a, b) => b.total - a.total);
        for (const c of remaining) {
            const agedOut = c.ageHours > STANDBY_MAX_AGE_HOURS;
            const belowBar = c.total < SCORE_REVIEW_MIN;
            if (!agedOut && !belowBar && result.standby < STANDBY_POOL_SIZE) {
                result.standby++;
                // Keep the visible score current while it waits.
                if (c.current) {
                    await supabaseAdmin
                        .from('posts')
                        .update({ post_score: c.current.total, score_breakdown: c.current })
                        .eq('id', c.post.id)
                        .eq('status', 'approved')
                        .is('scheduled_post_time', null);
                }
                continue;
            }
            const reason = agedOut
                ? `standby aged out (${Math.round(c.ageHours)}h > ${STANDBY_MAX_AGE_HOURS}h)`
                : belowBar
                    ? `standby decayed below the bar (${c.total}/100 < ${SCORE_REVIEW_MIN})`
                    : `standby overflow (pool keeps top ${STANDBY_POOL_SIZE})`;
            const demote: Record<string, unknown> = { status: 'pending' };
            if (c.current) {
                demote.post_score = c.current.total;
                demote.score_breakdown = c.current;
            }
            const { data: demoted } = await supabaseAdmin
                .from('posts')
                .update(demote)
                .eq('id', c.post.id)
                .eq('status', 'approved')
                .is('scheduled_post_time', null)
                .select('id');
            if (demoted?.length) {
                result.dropped++;
                await logAction({
                    action: 'standby_dropped',
                    entityId: c.post.id,
                    entityTitle: c.post.title,
                    actor: 'Scheduler',
                    reason,
                });
            }
        }
    } catch (e: any) {
        // Selection must never sink the cycle that called it.
        console.error('[Scheduler] runSlotSelection failed:', e?.message || e);
    }

    return result;
}

// Re-exported for callers that log the current lane/verdict context.
export type { PostScore };
