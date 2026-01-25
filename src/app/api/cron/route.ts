
import { NextRequest, NextResponse } from 'next/server';
import { runBlogEngine } from '@/lib/engine/engine';

// Vercel Cron ensures this header is present if secured, 
// but for now we'll allow flexible execution or check CRON_SECRET if you set it.
// To secure: Set CRON_SECRET env var and check:
// const authHeader = req.headers.get('authorization');
// if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return unauthorized;

export async function GET(req: NextRequest) {
    // 1. Get Slot from Query Param
    const { searchParams } = new URL(req.url);
    const slot = searchParams.get('slot');

    if (!slot || !['08:00', '12:00', '16:00', '20:00', '15:00', 'hourly'].includes(slot)) {
        return NextResponse.json({ error: 'Invalid or missing slot parameter.' }, { status: 400 });
    }

    console.log(`[Cron] Triggered for slot: ${slot}`);

    try {
        // Run the engine
        // We pass 'true' to force validation if needed, or false to be strict/safe.
        // Usually, cron runs once per slot, so false is safer (avoids dupes).
        const result = await runBlogEngine(slot as any, false);

        if (result) {
            return NextResponse.json({ success: true, post: result.title });
        } else {
            return NextResponse.json({ success: true, message: 'Engine ran but no new post generated (criteria or duplicate).' });
        }
    } catch (error: any) {
        console.error('[Cron] Engine Error:', error);
        return NextResponse.json({ error: 'Engine crashed', details: error.message }, { status: 500 });
    }
}
