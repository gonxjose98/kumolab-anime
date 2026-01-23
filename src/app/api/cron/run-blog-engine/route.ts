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
    let slot: '08:00' | '12:00' | '16:00' | '20:00' | null = null;
    try {
        // 0. Security Check
        // Allow if triggered by Vercel Cron OR if a valid CRON_SECRET is provided (e.g. from GitHub Actions)
        const authHeader = request.headers.get('authorization');
        const isVercelCron = request.headers.get('x-vercel-cron') === '1';
        const isValidSecret = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;

        if (!isVercelCron && !isValidSecret) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }

        // 1. Get slot from query param (Override) or current time
        const { searchParams } = new URL(request.url);
        const querySlot = searchParams.get('slot');

        const now = new Date();
        const estTimeFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            hour: 'numeric',
            hour12: false
        });

        const hourEST = parseInt(estTimeFormatter.format(now));
        console.log(`[CRON] Woke up at ${now.toISOString()} (UTC). EST Hour: ${hourEST}. Query Slot: ${querySlot}`);

        // 2. Map Hour/Param to Slot
        // 2. Map Hour/Param to Slot

        if (querySlot && ['08:00', '12:00', '16:00', '15:00', '20:00'].includes(querySlot)) {
            slot = querySlot as any;
        } else {
            // ROBUST WINDOW MAPPING (Ensures drops even if cron is slightly late)
            if (hourEST >= 8 && hourEST < 10) slot = '08:00';
            else if (hourEST >= 12 && hourEST < 14) slot = '12:00';
            else if (hourEST >= 16 && hourEST < 18) slot = '16:00';
            else if (hourEST >= 20 && hourEST < 22) slot = '20:00';
        }

        if (!slot) {
            // No slot scheduled for this hour
            return NextResponse.json({
                success: true,
                message: `No active window for ${hourEST}:00 EST. System standing by.`
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

    } catch (error: any) {
        console.error('[CRON] Error running blog engine:', error);

        // Log critical failure to DB
        // We might not have 'slot' here if parsing failed, so fallback
        // But 'slot' variable is in scope (line 39), just might be null.
        // We can recover 'hourEST' from earlier logic or just say 'CRON_ERROR'
        const errorSlot = (typeof slot !== 'undefined' && slot) ? slot : 'CRON_ERROR';

        // Dynamic import to avoid circular dep issues if any (unlikely for logging lib)
        const { logSchedulerRun } = await import('@/lib/logging/scheduler');
        await logSchedulerRun(errorSlot, 'error', error.message || 'Unknown Crash', { stack: error.stack });

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
