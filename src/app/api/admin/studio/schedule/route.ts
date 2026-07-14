/**
 * /api/admin/studio/schedule
 *
 * The post-export scheduling action from Studio. In one step it both approves
 * and slots the freshly exported reel (or parks it as a draft):
 *   mode 'now'   → approved, scheduled for now (publishes on the next cron tick)
 *   mode 'peak'  → approved, scheduled for the next open ET peak-hour slot
 *   mode 'set'   → approved, scheduled for the operator's chosen time
 *   mode 'draft' → status=draft, not scheduled (finish it later)
 *
 * Setting status=approved with a scheduled_post_time is exactly what the
 * publish pipeline consumes, so this replaces the "approve it from the post
 * editor" step for Studio exports. Auth is enforced by middleware on
 * /api/admin/*; uses supabaseAdmin (service role).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logAction } from '@/lib/logging/structured-logger';

export const dynamic = 'force-dynamic';

const ET = 'America/New_York';
// KumoLab peak posting hours in ET (matches the SchedulePicker's peak set).
const PEAK_HOURS_ET = [12, 17, 18, 19, 20, 21, 22];

/** ET hour (0-23) of a Date. */
function etHourOf(d: Date): number {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: '2-digit', hourCycle: 'h23' }).format(d);
    return Number(s) % 24;
}

/** ET year-month-day-hour key, for one-post-per-hour collision detection. */
function etHourKey(d: Date): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}-${get('hour')}`;
}

/** The next open peak-hour slot from now, skipping hours already taken by
 *  other approved posts (one post per hour). */
async function nextPeakSlot(now: Date, excludePostId: string): Promise<Date> {
    const horizon = new Date(now.getTime() + 8 * 86_400_000);
    const { data } = await supabaseAdmin
        .from('posts')
        .select('id, scheduled_post_time')
        .eq('status', 'approved')
        .not('scheduled_post_time', 'is', null)
        .gte('scheduled_post_time', now.toISOString())
        .lte('scheduled_post_time', horizon.toISOString());

    const taken = new Set(
        (data || [])
            .filter((p) => p.id !== excludePostId)
            .map((p) => etHourKey(new Date(p.scheduled_post_time as string))),
    );

    // Start at the next full hour.
    const cand = new Date(now);
    cand.setMinutes(0, 0, 0);
    cand.setHours(cand.getHours() + 1);

    for (let i = 0; i < 24 * 8; i++) {
        if (cand.getTime() > now.getTime() && PEAK_HOURS_ET.includes(etHourOf(cand)) && !taken.has(etHourKey(cand))) {
            return new Date(cand);
        }
        cand.setHours(cand.getHours() + 1);
    }
    // Fallback: the next hour (shouldn't happen within an 8-day horizon).
    return cand;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const postId = body?.postId != null ? String(body.postId) : '';
        const mode = body?.mode as 'now' | 'peak' | 'set' | 'draft' | undefined;
        if (!postId) return NextResponse.json({ success: false, error: 'postId is required' }, { status: 400 });

        const now = new Date();
        let when: Date | null = null;
        let update: Record<string, any>;

        if (mode === 'draft') {
            update = { status: 'draft', is_published: false };
        } else if (mode === 'now') {
            when = now;
            update = { status: 'approved', is_published: false, scheduled_post_time: now.toISOString(), approved_at: now.toISOString(), approved_by: 'admin' };
        } else if (mode === 'set') {
            const t = new Date(body?.scheduledTime);
            if (isNaN(t.getTime())) return NextResponse.json({ success: false, error: 'A valid scheduledTime is required' }, { status: 400 });
            when = t;
            update = { status: 'approved', is_published: false, scheduled_post_time: t.toISOString(), approved_at: now.toISOString(), approved_by: 'admin' };
        } else if (mode === 'peak') {
            when = await nextPeakSlot(now, postId);
            update = { status: 'approved', is_published: false, scheduled_post_time: when.toISOString(), approved_at: now.toISOString(), approved_by: 'admin' };
        } else {
            return NextResponse.json({ success: false, error: 'Unknown mode' }, { status: 400 });
        }

        const { error } = await supabaseAdmin.from('posts').update(update).eq('id', postId);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

        await logAction({
            action: mode === 'draft' ? 'updated' : 'approved',
            entityType: 'post',
            entityId: postId,
            actor: 'Admin',
            reason: mode === 'draft' ? 'Saved as draft from Studio export' : `Scheduled (${mode}) for ${when?.toISOString()}`,
        }).catch(() => {});

        return NextResponse.json({ success: true, mode, scheduledTime: when?.toISOString() ?? null });
    } catch (e: any) {
        console.error('[studio/schedule] error', e);
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
