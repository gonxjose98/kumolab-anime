/**
 * /api/admin/engine/schedule — the Engine clock's drag writes.
 *
 * POST { action: 'swap' | 'move' | 'assign' | 'cascade', ... }
 *
 * THE INVARIANT: no path here ever writes NULL to posts.scheduled_post_time.
 * NULL is not "unscheduled" in this system, it IS standby-pool membership
 * (runSlotSelection's pool query is `.eq('status','approved')
 * .is('scheduled_post_time', null)`), and a pooled post is exposed to the
 * pruner, which demotes it to status='pending' when it is >48h old, scored
 * <55, or beyond STANDBY_POOL_SIZE. A drag that parks a post in the pool can
 * therefore silently UNAPPROVE a post that was already going out. So a standby
 * post dropped on an occupied slot cascades the occupant to the next open peak
 * slot, and the whole drop is refused when there is none.
 *
 * Every write is compare-and-swap gated on the row's expected current slot
 * time, mirroring the scheduler's own CAS pattern, so a drag can neither
 * double-book a slot nor stomp a concurrent automatic booking.
 *
 * Scores are deliberately NOT refreshed. runSlotSelection re-scores when IT
 * books a slot; Jose overriding placement is a statement about placement, not
 * a request to re-score.
 *
 * Auth: middleware gates /api/admin/engine/* by session + the `content` perm
 * (same as ./config).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { PLATFORM_DAILY_CAP } from '@/lib/engine/automation-config';
import {
    upcomingPeakSlots,
    loadSlotClaims,
    slotIsFree,
    withoutOwnClaim,
    SLOT_TIMING,
    type ConcreteSlot,
} from '@/lib/engine/scheduler';

export const dynamic = 'force-dynamic';

const CAP = PLATFORM_DAILY_CAP.instagram;
/** How far ahead a cascade may look for a home for the displaced occupant. */
const SLOT_HORIZON_DAYS = 7;

interface PostRow {
    id: string;
    title: string | null;
    status: string | null;
    type: string | null;
    claim_type: string | null;
    scheduled_post_time: string | null;
}

const SELECT = 'id, title, status, type, claim_type, scheduled_post_time';

/** Key visuals are Facebook-only and run on their own off-peak hourly grid. */
function isKeyVisual(p: PostRow): boolean {
    return (p.claim_type || '').toUpperCase() === 'NEW_KEY_VISUAL';
}

function bad(reason: string, status = 400) {
    return NextResponse.json({ ok: false, reason }, { status });
}

async function fetchPosts(ids: string[]): Promise<Map<string, PostRow>> {
    const { data, error } = await supabaseAdmin.from('posts').select(SELECT).in('id', ids);
    if (error) throw new Error(error.message);
    const map = new Map<string, PostRow>();
    for (const r of (data || []) as PostRow[]) map.set(r.id, r);
    return map;
}

/** The peak slot at `iso`, or null if that instant is not a live peak slot. */
function slotAt(slots: ConcreteSlot[], iso: string): ConcreteSlot | null {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return null;
    return slots.find(s => s.at.getTime() === t) || null;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({} as any));
        const action = String(body?.action || '');
        const now = new Date();

        if (!['swap', 'move', 'assign', 'cascade'].includes(action)) {
            return bad(`unknown action: ${body?.action}`);
        }

        const slots = await upcomingPeakSlots(now, SLOT_HORIZON_DAYS);
        const horizon = slots.length
            ? slots[slots.length - 1].at
            : new Date(now.getTime() + SLOT_HORIZON_DAYS * 86_400_000);
        const state = await loadSlotClaims(now, horizon);

        // ── swap: two already-scheduled posts trade times ──────────────────
        if (action === 'swap') {
            const aId = String(body?.postId || '');
            const bId = String(body?.targetPostId || '');
            if (!aId || !bId) return bad('swap needs postId and targetPostId');
            if (aId === bId) return bad('a post cannot swap with itself');

            const posts = await fetchPosts([aId, bId]);
            const a = posts.get(aId);
            const b = posts.get(bId);
            if (!a || !b) return bad('one of those posts no longer exists — refresh');
            for (const p of [a, b]) {
                if (p.status !== 'approved') return bad(`"${p.title || p.id}" is no longer approved — refresh`);
                if (!p.scheduled_post_time) return bad('swap needs two scheduled posts');
                if (isKeyVisual(p)) {
                    return bad('Key visuals are Facebook-only and run on their own hourly grid — they cannot take an Instagram peak slot.');
                }
            }

            // supabase-js has no client-side transaction: a per-row loop that
            // half-fails leaves both posts in ONE slot. The RPC does both
            // UPDATEs in one body, CAS-gated on each expected current time.
            const { data, error } = await supabaseAdmin.rpc('swap_post_slots', {
                post_a: aId,
                post_b: bId,
                expected_a: a.scheduled_post_time,
                expected_b: b.scheduled_post_time,
            });
            if (error) return bad(`the schedule changed under you — refresh (${error.message})`, 409);
            if (data === false) return bad('the schedule changed under you — refresh', 409);

            return NextResponse.json({
                ok: true,
                action,
                updates: [
                    { id: aId, scheduled_post_time: b.scheduled_post_time },
                    { id: bId, scheduled_post_time: a.scheduled_post_time },
                ],
            });
        }

        // ── move / assign / cascade all target a concrete peak slot ────────
        const postId = String(body?.postId || '');
        const toTime = String(body?.toTime || '');
        if (!postId || !toTime) return bad(`${action} needs postId and toTime`);

        const slot = slotAt(slots, toTime);
        if (!slot) return bad('that slot is no longer on the schedule — refresh');

        const posts = await fetchPosts([postId]);
        const post = posts.get(postId);
        if (!post) return bad('that post no longer exists — refresh');
        if (post.status !== 'approved') return bad('that post is no longer approved — refresh');
        if (isKeyVisual(post)) {
            return bad('Key visuals are Facebook-only and run on their own hourly grid — they cannot take an Instagram peak slot.');
        }

        // ── move: scheduled → a different empty slot ───────────────────────
        if (action === 'move') {
            const from = post.scheduled_post_time;
            if (!from) return bad('that post has no slot yet — drop it as an assign');
            if (new Date(from).getTime() === slot.at.getTime()) {
                return NextResponse.json({ ok: true, action, updates: [{ id: postId, scheduled_post_time: from }] });
            }

            // dayCounts ALREADY counts the dragged post, so a same-day move on a
            // day sitting at 3/3 (the normal healthy state) would be refused for
            // a change that alters no count at all. Subtract its own claim first.
            const free = withoutOwnClaim(state, new Date(from));
            const reason = refusal(slot, free);
            if (reason) return bad(reason);

            const { data, error } = await supabaseAdmin
                .from('posts')
                .update({ scheduled_post_time: slot.at.toISOString() })
                .eq('id', postId)
                .eq('status', 'approved')
                .eq('scheduled_post_time', from)
                .select('id');
            if (error) return bad(error.message, 500);
            if (!data?.length) return bad('that post moved since you loaded the page — refresh', 409);

            return NextResponse.json({ ok: true, action, updates: [{ id: postId, scheduled_post_time: slot.at.toISOString() }] });
        }

        // ── assign: standby (NULL slot) → an empty slot ────────────────────
        if (action === 'assign') {
            if (post.scheduled_post_time) return bad('that post already has a slot — drop it as a move');

            const reason = refusal(slot, state);
            if (reason) return bad(reason);

            const { data, error } = await supabaseAdmin
                .from('posts')
                .update({ scheduled_post_time: slot.at.toISOString() })
                .eq('id', postId)
                .eq('status', 'approved')
                .is('scheduled_post_time', null)
                .select('id');
            if (error) return bad(error.message, 500);
            if (!data?.length) return bad('the scheduler booked that post while you were dragging — refresh', 409);

            return NextResponse.json({ ok: true, action, updates: [{ id: postId, scheduled_post_time: slot.at.toISOString() }] });
        }

        // ── cascade: standby → an OCCUPIED slot; the occupant moves on ─────
        // The occupant NEVER goes to the pool: NULL there hands it to the
        // pruner. It takes the next open peak slot, or the drop is refused.
        if (post.scheduled_post_time) return bad('cascade is for a standby post — drop a scheduled one as a swap');

        const occupant = await findOccupant(slot, String(body?.occupantId || ''));
        if (!occupant) return bad('that slot is empty now — drop it again to assign');
        if (occupant.id === postId) return bad('that post already holds that slot');

        // Claims are unchanged by the handover (the standby post takes exactly
        // the instant the occupant vacates), so the occupant's new home is the
        // first slot free against the CURRENT state.
        const next = slots.find(s =>
            s.at.getTime() !== slot.at.getTime() &&
            s.at.getTime() > now.getTime() + SLOT_TIMING.MIN_LEAD_MS &&
            slotIsFree(s, state.claims, state.dayCounts, CAP),
        );
        if (!next) {
            return bad(
                `No open peak slot in the next ${SLOT_HORIZON_DAYS} days for "${occupant.title || 'the post in that slot'}" to move to. ` +
                `Nothing was changed — free a slot first (a post returned to standby can be dropped from the queue by the scheduler).`,
            );
        }

        // 1. The occupant vacates FIRST, CAS-gated on the time it holds now.
        const occFrom = occupant.scheduled_post_time!;
        const { data: moved, error: moveErr } = await supabaseAdmin
            .from('posts')
            .update({ scheduled_post_time: next.at.toISOString() })
            .eq('id', occupant.id)
            .eq('status', 'approved')
            .eq('scheduled_post_time', occFrom)
            .select('id');
        if (moveErr) return bad(moveErr.message, 500);
        if (!moved?.length) return bad('that slot changed while you were dragging — refresh', 409);

        // 2. The standby post takes the vacated slot.
        const { data: placed, error: placeErr } = await supabaseAdmin
            .from('posts')
            .update({ scheduled_post_time: slot.at.toISOString() })
            .eq('id', postId)
            .eq('status', 'approved')
            .is('scheduled_post_time', null)
            .select('id');

        if (placeErr || !placed?.length) {
            // Put the occupant back where it was. It holds a real time either
            // way — this only restores the intended one.
            await supabaseAdmin
                .from('posts')
                .update({ scheduled_post_time: occFrom })
                .eq('id', occupant.id)
                .eq('status', 'approved')
                .eq('scheduled_post_time', next.at.toISOString());
            return bad('the scheduler booked that post while you were dragging — refresh', 409);
        }

        return NextResponse.json({
            ok: true,
            action,
            updates: [
                { id: postId, scheduled_post_time: slot.at.toISOString() },
                { id: occupant.id, scheduled_post_time: next.at.toISOString() },
            ],
            cascaded: { id: occupant.id, title: occupant.title, to: next.at.toISOString(), label: next.label },
        });
    } catch (e: any) {
        console.error('[engine/schedule] error', e);
        return NextResponse.json({ ok: false, reason: e?.message || 'Internal error' }, { status: 500 });
    }
}

/**
 * Why a slot can't take one more post, or null if it can. Uses the SAME
 * slotIsFree the automatic selector uses, so a drag can't break the 3/day
 * Instagram cap the engine holds itself to.
 */
function refusal(slot: ConcreteSlot, state: { claims: Date[]; dayCounts: Map<string, number> }): string | null {
    if (slotIsFree(slot, state.claims, state.dayCounts, CAP)) return null;
    if ((state.dayCounts.get(slot.etDay) || 0) >= CAP) {
        return `${slot.etDay} ET is already at the ${CAP}-post Instagram cap. Move one off that day first.`;
    }
    return 'That slot is taken — drop onto the bead to swap, or pick an open slot.';
}

/** The approved, non-key-visual post holding `slot` (within the exclusion window). */
async function findOccupant(slot: ConcreteSlot, hintId: string): Promise<PostRow | null> {
    const lo = new Date(slot.at.getTime() - SLOT_TIMING.SLOT_EXCLUSION_MS).toISOString();
    const hi = new Date(slot.at.getTime() + SLOT_TIMING.SLOT_EXCLUSION_MS).toISOString();
    const { data, error } = await supabaseAdmin
        .from('posts')
        .select(SELECT)
        .eq('status', 'approved')
        .not('scheduled_post_time', 'is', null)
        .gte('scheduled_post_time', lo)
        .lte('scheduled_post_time', hi);
    if (error) throw new Error(error.message);
    const rows = ((data || []) as PostRow[]).filter(r => r.type !== 'DROP' && !isKeyVisual(r) && r.scheduled_post_time);
    if (!rows.length) return null;
    return rows.find(r => r.id === hintId) || rows[0];
}
