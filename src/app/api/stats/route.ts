import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

// Midnight in America/New_York for "today" as a UTC ISO string.
// Resolves DST automatically via Intl. NY is always behind UTC.
function nyDayStartISO(): string {
    const nyDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const utcMidnight = new Date(`${nyDate}T00:00:00Z`);
    const nyHour = parseInt(new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit', hour12: false,
    }).format(utcMidnight), 10);
    const hoursAhead = (24 - nyHour) % 24;
    return new Date(utcMidnight.getTime() + hoursAhead * 3_600_000).toISOString();
}

export async function GET(req: NextRequest) {
    try {
        const todayISO = nyDayStartISO();

        // Start of week (Sunday) in NY timezone
        const weekStart = new Date(todayISO);
        weekStart.setUTCDate(weekStart.getUTCDate() - new Date(todayISO).getUTCDay());
        const weekStartISO = weekStart.toISOString();

        // Count every post that went live today (NY midnight → now)
        const { count: todayDrops, error: dropsError } = await supabaseAdmin
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'published')
            .gte('published_at', todayISO);

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
