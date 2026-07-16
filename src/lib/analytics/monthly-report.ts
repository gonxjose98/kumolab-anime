// Reader for the monthly_metrics snapshots that back the Monthly Reports view
// (and, later, the sponsor generator). Capture lives in monthly-snapshot.ts;
// this is the read side.

import { supabaseAdmin } from '@/lib/supabase/admin';

export interface MonthlyReportRow {
    month: string; // YYYY-MM-01
    captured_at: string;
    website: Record<string, unknown> | null;
    instagram: Record<string, unknown> | null;
    facebook: Record<string, unknown> | null;
    threads: Record<string, unknown> | null;
    youtube: Record<string, unknown> | null;
    business: Record<string, unknown> | null;
    meta: Record<string, string> | null;
    analysis: string | null;
}

/** All captured months, newest first (cap 60 = five years of monthly rows). */
export async function getMonthlyReports(): Promise<MonthlyReportRow[]> {
    try {
        const { data, error } = await supabaseAdmin
            .from('monthly_metrics')
            .select('month, captured_at, website, instagram, facebook, threads, youtube, business, meta, analysis')
            .order('month', { ascending: false })
            .limit(60);
        if (error || !data) return [];
        return data as MonthlyReportRow[];
    } catch {
        return [];
    }
}
