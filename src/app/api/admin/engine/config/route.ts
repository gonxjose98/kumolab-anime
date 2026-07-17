/**
 * /api/admin/engine/config
 *
 * GET  — current formula, peak slots, and live scheduled queue (for the Engine
 *        tab; the queue refreshes without a full reload).
 * POST — { action: 'savePeakSlots', slots: PeakSlot[] } to persist edited slot times.
 *
 * Auth: middleware gates /api/admin/engine/* by session + the `content` perm.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPostFormula, getPeakSlots, savePeakSlots, getScheduledQueue } from '@/lib/engine/engine-config';

export const dynamic = 'force-dynamic';

export async function GET() {
    const [formula, slots, queue] = await Promise.all([
        getPostFormula(),
        getPeakSlots(),
        getScheduledQueue(),
    ]);
    return NextResponse.json({ ok: true, formula, slots, queue });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        if (body?.action === 'savePeakSlots') {
            const res = await savePeakSlots(body.slots);
            return NextResponse.json(res, { status: res.ok ? 200 : 400 });
        }
        return NextResponse.json({ ok: false, reason: `unknown action: ${body?.action}` }, { status: 400 });
    } catch (e: any) {
        console.error('[engine/config] error', e);
        return NextResponse.json({ ok: false, reason: e?.message || 'Internal error' }, { status: 500 });
    }
}
