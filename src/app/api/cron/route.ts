import { NextRequest, NextResponse } from 'next/server';
import { runDetectionWorker } from '@/lib/engine/detection-worker';
import { runProcessingWorker } from '@/lib/engine/processing-worker';
import { runBlogEngine, publishScheduledPosts } from '@/lib/engine/engine';

/**
 * NEW 3-Tier Intelligence System Cron Handler
 * 
 * Workers:
 * - detection: Runs every 10 min (lightweight RSS/YouTube checks)
 * - processing: Runs hourly (scoring, deduplication, approvals)
 * - dailydrops: Runs at 6 AM EST (AniList daily episodes)
 */

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const worker = searchParams.get('worker');
    const slot = searchParams.get('slot');

    console.log(`[Cron] Triggered: worker=${worker || 'legacy'}, slot=${slot || 'none'} at ${new Date().toISOString()}`);

    try {
        // NEW ARCHITECTURE: Worker-based system
        if (worker === 'detection') {
            console.log('[Cron] Running Detection Worker...');
            const result = await runDetectionWorker();
            return NextResponse.json({
                success: true,
                worker: 'detection',
                result: {
                    candidates: result.totalCandidates,
                    new: result.newCandidates,
                    sources: result.sourcesChecked,
                    errors: result.errors.length
                }
            });
        }
        
        if (worker === 'processing') {
            console.log('[Cron] Running Processing Worker...');
            const result = await runProcessingWorker();
            return NextResponse.json({
                success: true,
                worker: 'processing',
                result: {
                    processed: result.processed,
                    accepted: result.accepted,
                    rejected: result.rejected,
                    duplicates: result.duplicates,
                    errors: result.errors.length
                }
            });
        }
        
        if (worker === 'dailydrops') {
            console.log('[Cron] Running Daily Drops...');
            await publishScheduledPosts();
            const result = await runBlogEngine('hourly', false);
            return NextResponse.json({
                success: true,
                worker: 'dailydrops',
                post: result ? result.title : null
            });
        }
        
        // LEGACY SUPPORT: Old slot-based system (gradual migration)
        if (slot) {
            console.log('[Cron] Running legacy engine (slot-based)...');
            await publishScheduledPosts();
            const result = await runBlogEngine(slot as any, false);
            return NextResponse.json({
                success: true,
                worker: 'legacy',
                post: result ? result.title : null
            });
        }
        
        return NextResponse.json({
            error: 'Invalid worker or slot parameter.',
            valid_workers: ['detection', 'processing', 'dailydrops'],
            valid_slots: ['06:00', '08:00', '12:00', '16:00', '20:00', 'hourly']
        }, { status: 400 });
        
    } catch (error: any) {
        console.error('[Cron] Worker Error:', error);
        return NextResponse.json({
            error: 'Worker crashed',
            details: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }, { status: 500 });
    }
}