/**
 * /api/admin/engine/tiers
 *
 * GET  — list all anime tier rows (for the Engine admin tab).
 * POST — mutate: { action: 'setTier', id, tier } | { action: 'add', anime, studio?, tier }
 *                | { action: 'remove', id }
 *
 * Auth: middleware gates /api/admin/engine/* by session + the `content`
 * permission (owner bypasses). These edits change what the pipeline prioritizes.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
    getAnimeTiers,
    setAnimeTier,
    addAnimeTier,
    removeAnimeTier,
} from '@/lib/engine/anime-tiers';

export const dynamic = 'force-dynamic';

export async function GET() {
    const tiers = await getAnimeTiers();
    return NextResponse.json({ ok: true, tiers });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const action = String(body?.action || '');

        if (action === 'setTier') {
            if (!body?.id) return NextResponse.json({ ok: false, reason: 'id required' }, { status: 400 });
            const res = await setAnimeTier(String(body.id), Number(body.tier));
            return NextResponse.json(res, { status: res.ok ? 200 : 400 });
        }
        if (action === 'add') {
            const res = await addAnimeTier({
                anime: String(body.anime || ''),
                studio: body.studio != null ? String(body.studio) : null,
                tier: Number(body.tier),
                note: body.note != null ? String(body.note) : null,
            });
            return NextResponse.json(res, { status: res.ok ? 200 : 400 });
        }
        if (action === 'remove') {
            if (!body?.id) return NextResponse.json({ ok: false, reason: 'id required' }, { status: 400 });
            const res = await removeAnimeTier(String(body.id));
            return NextResponse.json(res, { status: res.ok ? 200 : 400 });
        }
        return NextResponse.json({ ok: false, reason: `unknown action: ${action}` }, { status: 400 });
    } catch (e: any) {
        console.error('[engine/tiers] error', e);
        return NextResponse.json({ ok: false, reason: e?.message || 'Internal error' }, { status: 500 });
    }
}
