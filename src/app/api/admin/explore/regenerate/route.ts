/**
 * POST /api/admin/explore/regenerate
 *
 * Manual Explore refresh. Owner or `analytics` permission. Enforced server-side:
 * EXPLORE_ENABLED kill switch, the Claude key, max runs per ET day, cooldown,
 * and the monthly $ cap (inside runExplore).
 */

import { NextResponse } from 'next/server';
import { getAccess } from '@/lib/auth/access';
import { exploreConfig } from '@/lib/explore/config';
import { manualGate, runExplore } from '@/lib/explore/generate';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST() {
    const access = await getAccess();
    if (!access.email || (!access.isOwner && !access.perms.analytics)) {
        return NextResponse.json({ ok: false, error: 'Not allowed' }, { status: 403 });
    }
    if (!exploreConfig.enabled()) return NextResponse.json({ ok: false, error: 'Explore is switched off (EXPLORE_ENABLED=false)' }, { status: 409 });
    if (!exploreConfig.hasKey()) return NextResponse.json({ ok: false, error: 'Connect Claude first: ANTHROPIC_API_KEY is not set' }, { status: 409 });

    const gate = await manualGate();
    if (!gate.allowed) return NextResponse.json({ ok: false, error: gate.reason, nextAt: gate.nextAt ?? null }, { status: 429 });

    const result = await runExplore({ trigger: 'manual' });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
