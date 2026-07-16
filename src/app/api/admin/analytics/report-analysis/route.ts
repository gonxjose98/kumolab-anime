/**
 * POST /api/admin/analytics/report-analysis
 *
 * Save a hand-edited written analysis for one captured month. Body:
 * `{ month: 'YYYY-MM' | 'YYYY-MM-01', analysis: string }`. Only touches the
 * `analysis` column, so it never clobbers captured metrics (a later
 * re-snapshot overwrites metrics but re-derives analysis from a template — the
 * intent here is manual polish that survives until the next snapshot).
 *
 * Auth: middleware gates /api/admin/analytics/* by session + `analytics` perm.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const MONTH_RE = /^\d{4}-\d{2}(-\d{2})?$/;
const MAX_LEN = 8000;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const rawMonth = typeof body?.month === 'string' ? body.month.trim() : '';
        if (!MONTH_RE.test(rawMonth)) {
            return NextResponse.json({ ok: false, reason: 'month must be YYYY-MM' }, { status: 400 });
        }
        const month = `${rawMonth.slice(0, 7)}-01`;
        const analysis = typeof body?.analysis === 'string' ? body.analysis.slice(0, MAX_LEN) : '';

        const { error } = await supabaseAdmin
            .from('monthly_metrics')
            .update({ analysis })
            .eq('month', month);
        if (error) {
            return NextResponse.json({ ok: false, reason: error.message }, { status: 502 });
        }
        return NextResponse.json({ ok: true, month });
    } catch (e: any) {
        console.error('[analytics/report-analysis] error', e);
        return NextResponse.json({ ok: false, reason: e?.message || 'Internal error' }, { status: 500 });
    }
}
