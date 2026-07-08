/**
 * POST /api/admin/analytics/sync-metrics
 *
 * Pulls real per-post Instagram numbers (views, reach, likes, comments) from the
 * Meta Graph API into `posts.social_metrics`, so the analytics "Social" column
 * stops reading empty. Prioritizes posts with no metrics yet, so repeated calls
 * backfill the whole history in chunks. Optional body `{ limit }` (default 100).
 *
 * Auth: middleware gates /api/admin/* by Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { syncSocialMetrics } from '@/lib/social/metrics-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const raw = Number(body?.limit);
        const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 300) : 100;

        const result = await syncSocialMetrics(limit);
        return NextResponse.json(result, { status: result.ok ? 200 : 502 });
    } catch (e: any) {
        console.error('[sync-metrics] error', e);
        return NextResponse.json({ ok: false, reason: e?.message || 'Internal error' }, { status: 500 });
    }
}
