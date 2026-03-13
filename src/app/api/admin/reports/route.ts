import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET - Fetch daily reports
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const limit = parseInt(searchParams.get('limit') || '7');

    if (date) {
        // Fetch specific date
        const { data, error } = await supabaseAdmin
            .from('daily_reports')
            .select('*')
            .eq('report_date', date)
            .single();

        if (error) {
            return NextResponse.json(null, { status: 404 });
        }
        return NextResponse.json(data);
    }

    // Fetch recent reports
    const { data, error } = await supabaseAdmin
        .from('daily_reports')
        .select('*')
        .order('report_date', { ascending: false })
        .limit(limit);

    if (error) {
        return NextResponse.json([], { status: 200 });
    }

    return NextResponse.json(data || []);
}
