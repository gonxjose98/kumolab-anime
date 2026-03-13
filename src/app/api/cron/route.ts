import { NextRequest, NextResponse } from 'next/server';
import { runDetectionWorker } from '@/lib/engine/detection-worker';
import { runProcessingWorker } from '@/lib/engine/processing-worker';
import { runBlogEngine, publishScheduledPosts } from '@/lib/engine/engine';

/**
 * Unified Cron Handler
 *
 * Workers:
 * - detection:  Runs every 10 min via GitHub Actions (RSS, YouTube, Newsroom)
 * - processing: Runs hourly via Vercel cron (scoring, dedup, post creation + scheduled publishing)
 * - dailydrops: Runs at 6 AM EST via Vercel cron (AniList daily episodes)
 */

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const worker = searchParams.get('worker');

    console.log(`[Cron] Triggered: worker=${worker || 'none'} at ${new Date().toISOString()}`);

    try {
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
            console.log('[Cron] Running Processing Worker + Scheduled Publisher...');
            // Publish any approved scheduled posts first
            await publishScheduledPosts();
            // Then process new candidates
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
            console.log('[Cron] Running Daily Drops (6 AM EST)...');
            await publishScheduledPosts();
            const result = await runBlogEngine('06:00', false);
            return NextResponse.json({
                success: true,
                worker: 'dailydrops',
                post: result ? result.title : null
            });
        }

        return NextResponse.json({
            error: 'Invalid worker parameter.',
            valid_workers: ['detection', 'processing', 'dailydrops']
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
