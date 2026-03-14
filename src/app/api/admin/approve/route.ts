
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logAction } from '@/lib/logging/structured-logger';

export async function POST(req: NextRequest) {
    try {
        const { postIds } = await req.json();

        if (!postIds || !Array.isArray(postIds)) {
            return NextResponse.json({ success: false, error: 'Invalid postIds' }, { status: 400 });
        }

        const now = new Date();
        const results = [];

        // Get already-scheduled posts to avoid collisions
        const threeDaysOut = new Date(now);
        threeDaysOut.setDate(threeDaysOut.getDate() + 3);

        const { data: existingScheduled } = await supabaseAdmin
            .from('posts')
            .select('scheduled_post_time')
            .eq('status', 'approved')
            .not('scheduled_post_time', 'is', null)
            .gte('scheduled_post_time', now.toISOString())
            .lte('scheduled_post_time', threeDaysOut.toISOString());

        const takenHours = new Set(
            (existingScheduled || []).map(p => {
                const d = new Date(p.scheduled_post_time);
                return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
            })
        );

        for (let i = 0; i < postIds.length; i++) {
            const postId = postIds[i];
            const scheduledTime = findNextSlot(now, takenHours);

            // Mark this slot as taken for the next iteration
            const key = `${scheduledTime.getFullYear()}-${scheduledTime.getMonth()}-${scheduledTime.getDate()}-${scheduledTime.getHours()}`;
            takenHours.add(key);

            const { data, error } = await supabaseAdmin
                .from('posts')
                .update({
                    status: 'approved',
                    is_published: false,
                    scheduled_post_time: scheduledTime.toISOString(),
                    approved_at: now.toISOString(),
                    approved_by: 'admin'
                })
                .eq('id', postId)
                .select();

            if (error) {
                results.push({ id: postId, success: false, error: error.message });
            } else {
                results.push({ id: postId, success: true, scheduledTime: scheduledTime.toISOString() });
                await logAction({ action: 'approved', entityId: postId, actor: 'Admin', reason: `Scheduled for ${scheduledTime.toISOString()}` });
            }
        }

        return NextResponse.json({ success: true, results });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

/**
 * Find the next available hourly slot within the publishing window (8 AM – 10 PM EST).
 * Each post gets its own hour — max 1 post per hour.
 */
function findNextSlot(baseDate: Date, takenHours: Set<string>): Date {
    const EST_OFFSET = -5;
    const WINDOW_START = 8;  // 8 AM EST
    const WINDOW_END = 22;   // 10 PM EST

    // Start from the next full hour
    const candidate = new Date(baseDate);
    candidate.setMinutes(0, 0, 0);
    candidate.setHours(candidate.getHours() + 1);

    // Search up to 72 hours ahead
    for (let i = 0; i < 72; i++) {
        const estHour = new Date(
            candidate.getTime() + (candidate.getTimezoneOffset() + EST_OFFSET * 60) * 60000
        ).getHours();

        const key = `${candidate.getFullYear()}-${candidate.getMonth()}-${candidate.getDate()}-${candidate.getHours()}`;

        if (estHour >= WINDOW_START && estHour < WINDOW_END && !takenHours.has(key)) {
            return new Date(candidate);
        }
        candidate.setHours(candidate.getHours() + 1);
    }

    // Fallback: next day 8 AM EST
    const fallback = new Date(baseDate);
    fallback.setDate(fallback.getDate() + 1);
    // Convert 8 AM EST to UTC
    fallback.setHours(WINDOW_START - EST_OFFSET, 0, 0, 0);
    return fallback;
}
