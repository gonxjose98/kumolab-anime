
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
    try {
        const { postIds } = await req.json();

        if (!postIds || !Array.isArray(postIds)) {
            return NextResponse.json({ success: false, error: 'Invalid postIds' }, { status: 400 });
        }

        const now = new Date();
        const results = [];

        // Simple Slot Logic
        // Slots: 10:00, 14:00, 18:00, 21:00
        const slots = [10, 14, 18, 21];

        // Find next available slots
        // We need to check what's already scheduled to avoid collisions if we want to be perfect,
        // but the user's rules are simpler. Let's follow them exactly first and then refine.

        // "First approved post -> 10 AM" etc.
        // This suggests we should keep track of the sequence in the bulk operation.

        for (let i = 0; i < postIds.length; i++) {
            const postId = postIds[i];
            const scheduledTime = calculateScheduledTime(now, i);

            const { data, error } = await supabaseAdmin
                .from('posts')
                .update({
                    status: 'approved',
                    is_published: false,
                    scheduled_post_time: scheduledTime.toISOString(),
                    approved_at: now.toISOString(),
                    approved_by: 'admin' // Placeholder
                })
                .eq('id', postId)
                .select();

            if (error) {
                results.push({ id: postId, success: false, error: error.message });
            } else {
                results.push({ id: postId, success: true });
            }
        }

        return NextResponse.json({ success: true, results });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

function calculateScheduledTime(baseDate: Date, index: number): Date {
    const date = new Date(baseDate);
    const currentHour = date.getHours();

    // slots: 10, 14, 18, 21 (EST/Local?) - Assume Local for now as per "current time"
    const standardSlots = [10, 14, 18, 21];

    // User's rule:
    // If < 10 AM -> 10 AM
    // 10-2 -> 2 PM
    // 2-6 -> 6 PM
    // > 6 PM -> 10 AM tomorrow

    // For bulk approvals, we stagger them.
    // Let's implement the staggered logic:
    // We treat the "index" as the sequence in the bulk batch.

    const dayOffset = Math.floor(index / 4);
    const slotIndex = index % 4;
    const slotHour = standardSlots[slotIndex];

    const targetDate = new Date(baseDate);
    targetDate.setDate(targetDate.getDate() + dayOffset);
    targetDate.setHours(slotHour, 0, 0, 0);

    // If the calculated slot is in the past, move to next slot or next day
    if (targetDate <= baseDate) {
        // Find next available slot today
        const nextSlot = standardSlots.find(h => h > currentHour);
        if (nextSlot) {
            targetDate.setHours(nextSlot, 0, 0, 0);
        } else {
            // Tomorrow 10 AM
            targetDate.setDate(targetDate.getDate() + 1);
            targetDate.setHours(10, 0, 0, 0);
        }
    }

    return targetDate;
}
