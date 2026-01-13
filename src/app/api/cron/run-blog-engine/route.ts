import { NextRequest, NextResponse } from 'next/server';
import { runBlogEngine } from '@/lib/engine/engine';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron-safe API endpoint for automated blog publishing
 * Triggered by Vercel Cron at scheduled times
 */
export async function GET(request: NextRequest) {
    try {
        // Get the slot from query params
        const searchParams = request.nextUrl.searchParams;
        const slot = searchParams.get('slot') as '08:00' | '12:00' | '15:00' | '21:00' | null;

        if (!slot || !['08:00', '12:00', '15:00', '21:00'].includes(slot)) {
            return NextResponse.json(
                { error: 'Invalid slot. Must be one of: 08:00, 12:00, 15:00, 21:00' },
                { status: 400 }
            );
        }

        console.log(`[CRON] Running blog engine for slot: ${slot}`);

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
                message: `Successfully published post for ${slot} UTC`
            });
        } else {
            return NextResponse.json({
                success: true,
                slot,
                post: null,
                message: `No post generated for ${slot} UTC (content unavailable or validation failed)`
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
