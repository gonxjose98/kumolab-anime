import { NextRequest, NextResponse } from 'next/server';
import { runDetectionWorker } from '@/lib/engine/detection-worker';
import { runProcessingWorker } from '@/lib/engine/processing-worker';
import { runBlogEngine, publishScheduledPosts } from '@/lib/engine/engine';
import { generateDailyReport } from '@/lib/engine/daily-report';
import { runCleanupWorker } from '@/lib/engine/cleanup-worker';

/**
 * Unified Cron Handler
 *
 * Auth: middleware.ts gates this route by Vercel cron header OR
 * `Authorization: Bearer ${CRON_SECRET}`. The check below is defense in depth
 * in case the matcher is ever misconfigured.
 *
 * Workers:
 * - detection:  RSS + YouTube scan
 * - processing: scoring, dedup, post creation + scheduled publishing
 * - dailydrops: 6 AM EST AniList daily episodes
 * - daily-report: end-of-day pipeline summary
 * - cleanup: 03:00 UTC retention sweep (expired posts, bucket orphans, log TTL)
 */

function isAuthorizedCron(req: NextRequest): boolean {
    if (req.headers.get('x-vercel-cron') === '1') return true;
    const secret = process.env.CRON_SECRET;
    return !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
    if (!isAuthorizedCron(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

        if (worker === 'daily-report') {
            console.log('[Cron] Running Daily Pipeline Report...');
            const report = await generateDailyReport();
            return NextResponse.json({
                success: true,
                worker: 'daily-report',
                headline: report.headline,
                grade: report.avg_quality_grade,
                accepted: report.candidates_accepted,
                published: report.posts_published,
                issues: report.issues.length,
            });
        }

        if (worker === 'cleanup') {
            console.log('[Cron] Running Cleanup Worker...');
            const result = await runCleanupWorker();
            return NextResponse.json({
                success: result.errors.length === 0,
                worker: 'cleanup',
                result,
            });
        }

        return NextResponse.json({
            error: 'Invalid worker parameter.',
            valid_workers: ['detection', 'processing', 'dailydrops', 'daily-report', 'cleanup']
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
