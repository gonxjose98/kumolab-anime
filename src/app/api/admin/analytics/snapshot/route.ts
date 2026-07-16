/**
 * POST /api/admin/analytics/snapshot
 *
 * Runs the monthly metrics capture on demand ("Snapshot now" on the analytics
 * page) — same logic the `monthly-snapshot` cron runs on the 1st. Body:
 * `{ month?: 'YYYY-MM' }`; omitted = the previous full month. UPSERTs on
 * `month`, so re-snapshotting a month simply refreshes its row.
 *
 * Auth: middleware gates /api/admin/analytics/* by Supabase session + the
 * `analytics` permission (owner bypasses), mirroring the page layout's
 * requireAccess('analytics').
 */

import { NextRequest, NextResponse } from 'next/server';
import { captureMonthlySnapshot } from '@/lib/analytics/monthly-snapshot';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MONTH_RE = /^\d{4}-\d{2}(-\d{2})?$/;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        let month: string | undefined;
        if (typeof body?.month === 'string' && body.month.trim()) {
            const m = body.month.trim();
            if (!MONTH_RE.test(m)) {
                return NextResponse.json({ ok: false, reason: 'month must be YYYY-MM' }, { status: 400 });
            }
            month = `${m.slice(0, 7)}-01`;
        }

        const result = await captureMonthlySnapshot(month);
        return NextResponse.json(
            { ok: result.ok, month: result.month, reason: result.reason, analysis: result.row?.analysis },
            { status: result.ok ? 200 : 502 },
        );
    } catch (e: any) {
        console.error('[analytics/snapshot] error', e);
        return NextResponse.json({ ok: false, reason: e?.message || 'Internal error' }, { status: 500 });
    }
}
