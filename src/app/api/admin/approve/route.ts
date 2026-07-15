
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logAction } from '@/lib/logging/structured-logger';
import { assignScheduledSlot } from '@/lib/engine/scheduler';

export async function POST(req: NextRequest) {
    try {
        const { postIds } = await req.json();

        if (!postIds || !Array.isArray(postIds)) {
            return NextResponse.json({ success: false, error: 'Invalid postIds' }, { status: 400 });
        }

        const now = new Date();
        const results = [];

        // Pull the fields the scheduler needs (source drives premium-studio
        // routing; claim_type feeds lane classification/logging).
        const { data: postRows } = await supabaseAdmin
            .from('posts')
            .select('id, source, claim_type')
            .in('id', postIds);
        const byId = new Map((postRows || []).map((p) => [p.id, p]));

        for (const postId of postIds) {
            const p = byId.get(postId);

            // Use the SAME slotting the auto-pipeline uses: DST-safe ET windows,
            // premium-studio priority, and dedup against already-claimed hours
            // (read from the DB). Replaces a divergent hardcoded-EST copy that
            // broke during daylight saving. Each post is written before the next
            // iteration, so assignScheduledSlot's DB read spaces the batch out.
            const slot = await assignScheduledSlot({
                source: p?.source ?? undefined,
                claim_type: p?.claim_type ?? null,
                isT1YouTube: false,
            });
            const scheduledTime = slot.scheduled_at;

            const { error } = await supabaseAdmin
                .from('posts')
                .update({
                    status: 'approved',
                    is_published: false,
                    scheduled_post_time: scheduledTime,
                    approved_at: now.toISOString(),
                    approved_by: 'admin',
                })
                .eq('id', postId)
                .select();

            if (error) {
                results.push({ id: postId, success: false, error: error.message });
            } else {
                results.push({ id: postId, success: true, scheduledTime });
                await logAction({ action: 'approved', entityId: postId, actor: 'Admin', reason: `Scheduled for ${scheduledTime} (${slot.reason})` });
            }
        }

        return NextResponse.json({ success: true, results });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
