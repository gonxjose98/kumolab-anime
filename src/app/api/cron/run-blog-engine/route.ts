import { NextRequest, NextResponse } from 'next/server';
import { runBlogEngine } from '@/lib/engine/engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron-safe API endpoint for automated blog publishing.
 * Triggered by Vercel Cron hourly (0 * * * *).
 * Internally checks EST time to dispatch correct slots.
 */
export async function GET(request: NextRequest) {
    try {
        // 1. Get current time in EST (America/New_York)
        // Vercel Cron runs on UTC, but we want to respect EST schedules.
        const now = new Date();
        const estTimeFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            hour: 'numeric',
            hour12: false
        });

        const hourEST = parseInt(estTimeFormatter.format(now));

        console.log(`[CRON] Woke up at ${now.toISOString()} (UTC). EST Hour: ${hourEST}`);

        // 2. Map EST Hour to Slot
        let slot: '08:00' | '12:00' | '16:00' | '20:00' | null = null;

        switch (hourEST) {
            case 8:
                slot = '08:00';
                break;
            case 12:
                slot = '12:00';
                break;
            case 16: // Changed from 15 to 16
                slot = '16:00'; // Changed from '15:00' to '16:00'
                break;
            case 20:
                slot = '20:00';
                break;
            default:
                // No slot scheduled for this hour
                return NextResponse.json({
                    success: true,
                    message: `No scheduled task for ${hourEST}:00 EST. System standing by.`
                });
        }

        console.log(`[CRON] Dispatching engine for slot: ${slot}`);

        // 3. Execute Engine for Matched Slot
        const result = await runBlogEngine(slot);

        if (result) {
            return NextResponse.json({
                success: true,
                slot,
                post: {
                    id: result.id,
                    title: result.title,
                    type: result.type,
                    timestamp: result.timestamp
                },
                message: `Successfully published post for ${slot} EST`
            });
        } else {
            return NextResponse.json({
                success: true,
                slot,
                post: null,
                message: `Task ran for ${slot} EST but no post was generated (content unavailable or already posted)`
            });
        }

    } catch (error) {
        console.error('[CRON] Error running blog engine:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
                message: 'Blog engine execution failed'
            },
            { status: 500 }
        );
    }
}
