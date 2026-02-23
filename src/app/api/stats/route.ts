import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        // Get today's date
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        // Get start of week
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        const weekStartISO = weekStart.toISOString();

        // Count today's drops
        const { count: todayDrops, error: dropsError } = await supabaseAdmin
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .eq('type', 'DROP')
            .gte('timestamp', todayISO);

        if (dropsError) throw dropsError;

        // Count trending posts (published in last 7 days with high engagement)
        const { count: trending, error: trendingError } = await supabaseAdmin
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .eq('is_published', true)
            .gte('timestamp', weekStartISO)
            .in('type', ['INTEL', 'TRENDING']);

        if (trendingError) throw trendingError;

        // Count verified posts this week
        const { count: verifiedThisWeek, error: verifiedError } = await supabaseAdmin
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .eq('is_published', true)
            .gte('timestamp', weekStartISO);

        if (verifiedError) throw verifiedError;

        return NextResponse.json({
            todayDrops: todayDrops || 0,
            trending: trending || 0,
            verifiedThisWeek: verifiedThisWeek || 0
        });

    } catch (error: any) {
        console.error('[Stats API] Error:', error);
        return NextResponse.json({
            todayDrops: 0,
            trending: 0,
            verifiedThisWeek: 0,
            error: error.message
        }, { status: 500 });
    }
}
