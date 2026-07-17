import { NextRequest, NextResponse } from 'next/server';
import { runDetectionWorker } from '@/lib/engine/detection-worker';
import { runProcessingWorker } from '@/lib/engine/processing-worker';
import { runBlogEngine, publishScheduledPosts } from '@/lib/engine/engine';
import { generateDailyReport } from '@/lib/engine/daily-report';
import { runCleanupWorker } from '@/lib/engine/cleanup-worker';
import { generateIntelImage } from '@/lib/engine/image-processor';
import { refreshMetaToken } from '@/lib/engine/token-health';
import { publishToSocials } from '@/lib/social/publisher';
import { syncSocialMetrics } from '@/lib/social/metrics-sync';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const maxDuration = 300;

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
            console.log('[Cron] Running Processing Worker...');
            // Publishing is its OWN cron now (worker=publish). It used to run
            // here first, but a slow video publish (download MP4 → IG upload →
            // poll → FB/Threads) stacked onto the processing cycle could push
            // this single request past the caller's ~100s Cloudflare limit
            // (backstop → HTTP 524) and risked nearing Vercel's 300s ceiling.
            // Decoupled so each worker stays fast and predictable.
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

        if (worker === 'publish') {
            // Dedicated publisher. Decoupled from processing so a slow video
            // publish can't time out that request. Runs on its own hourly cron
            // (see vercel.json). publishScheduledPosts is idempotent per-post
            // (flips status='published' up-front + per-post publisher lock), so
            // overlapping ticks can't double-publish.
            console.log('[Cron] Running Scheduled Publisher...');
            // Fill any open peak slots from the standby pool FIRST, so a slot
            // coming due this hour gets its highest-current-scoring candidate
            // before the publisher drains due posts. Never blocks publishing.
            let selection = null;
            try {
                const { runSlotSelection } = await import('@/lib/engine/scheduler');
                selection = await runSlotSelection();
            } catch (e: any) {
                console.warn('[Cron] slot selection failed (non-fatal):', e?.message || e);
            }
            await publishScheduledPosts();
            return NextResponse.json({ success: true, worker: 'publish', selection });
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

        // Re-broadcast a previously-published post to social. Used for
        // recovery / one-off backfills (e.g. when an IG post went out as
        // image-only because the publisher hadn't been wired for video
        // yet, or when a token expiry blocked the original broadcast).
        // Each invocation creates fresh social posts; the operator deletes
        // the old ones manually.
        if (worker === 'republish-social') {
            const idsParam = searchParams.get('postIds') || searchParams.get('postId');
            if (!idsParam) {
                return NextResponse.json({ error: 'postIds query param is required' }, { status: 400 });
            }
            const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);
            const results: any[] = [];
            for (const postId of ids) {
                try {
                    const { data: post, error } = await supabaseAdmin
                        .from('posts')
                        .select('*')
                        .eq('id', postId)
                        .single();
                    if (error || !post) {
                        results.push({ id: postId, success: false, error: error?.message || 'Post not found' });
                        continue;
                    }
                    const social = await publishToSocials(post as any);
                    // Merge any new social IDs back into the post row so the
                    // dashboard reflects the new Reels link too.
                    const merged = { ...((post as any).social_ids || {}), ...social };
                    await supabaseAdmin.from('posts').update({ social_ids: merged }).eq('id', postId);
                    results.push({ id: postId, success: true, social });
                } catch (e: any) {
                    results.push({ id: postId, success: false, error: e?.message || 'republish exception' });
                }
            }
            return NextResponse.json({ success: results.every(r => r.success), worker: 'republish-social', results });
        }

        // Diagnostic: report whether the yt-dlp + ffmpeg binaries are
        // actually present + executable in the deployed function.
        if (worker === 'diag-trailer') {
            const url = searchParams.get('url') || 'https://www.youtube.com/watch?v=yClYCc4kEp8';
            const { fetchYouTubeToBucket } = await import('@/lib/social/trailer-fetcher');
            const t0 = Date.now();
            const result = await fetchYouTubeToBucket(url, 'diag-' + Date.now());
            return NextResponse.json({
                success: !!result,
                worker: 'diag-trailer',
                ms: Date.now() - t0,
                result,
            });
        }

        // Diagnostic: run image-to-Reel against a given URL, return
        // FFmpeg stderr + exit code + output bytes. No publish.
        if (worker === 'diag-image-reel') {
            const url = searchParams.get('url');
            if (!url) {
                return NextResponse.json({ error: 'url query param required' }, { status: 400 });
            }
            const { imageToReel, fetchImageBuffer } = await import('@/lib/social/image-to-video');
            const t0 = Date.now();
            const buf = await fetchImageBuffer(url);
            if (!buf) {
                return NextResponse.json({ success: false, stage: 'fetch', error: 'image fetch returned null' });
            }
            const reel = await imageToReel(buf, { direction: 'in' });
            return NextResponse.json({
                success: !!(reel.buffer && reel.buffer.length > 0),
                source_bytes: buf.length,
                output_bytes: reel.buffer?.length ?? 0,
                exit_code: reel.exitCode,
                ms: Date.now() - t0,
                ffmpeg_args: reel.args,
                stderr_tail: reel.stderr.slice(-2000),
            });
        }

        if (worker === 'health-monitor') {
            const { getHealthSnapshot, fireHealthAlertsIfChanged } = await import('@/lib/engine/health-monitor');
            const snap = await getHealthSnapshot();
            const alerts = await fireHealthAlertsIfChanged(snap);
            return NextResponse.json({
                success: true,
                worker: 'health-monitor',
                overall: snap.overall,
                checks: snap.checks.map(c => ({ key: c.key, level: c.level, detail: c.detail })),
                alerts,
            });
        }

        if (worker === 'refresh-meta-token') {
            console.log('[Cron] Refreshing Meta token...');
            const result = await refreshMetaToken();
            return NextResponse.json({
                success: result.ok,
                worker: 'refresh-meta-token',
                rotated: result.rotated,
                daysUntilDataAccessExpiry: result.daysUntilDataAccessExpiry ?? null,
                reason: result.reason,
            });
        }

        if (worker === 'refresh-threads-token') {
            console.log('[Cron] Refreshing Threads token...');
            const { refreshThreadsToken } = await import('@/lib/engine/threads-token');
            const result = await refreshThreadsToken();
            return NextResponse.json({
                success: result.ok,
                worker: 'refresh-threads-token',
                rotated: result.rotated,
                daysUntilExpiry: result.daysUntilExpiry ?? null,
                reason: result.reason,
            });
        }

        // Per-post Instagram metrics → posts.social_metrics. Runs on a schedule
        // (see vercel.json) so the analytics "Social" column stays fresh without
        // anyone pressing the Sync button. Each run refreshes the most recent
        // posts (whose numbers move most) and picks up any newly-published post
        // still missing metrics. Rate-limit aware: stops cleanly if Meta throttles.
        if (worker === 'metrics-sync') {
            console.log('[Cron] Syncing per-post social metrics...');
            const raw = Number(searchParams.get('limit'));
            const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 300) : 150;
            const result = await syncSocialMetrics(limit);
            return NextResponse.json({ success: result.ok, worker: 'metrics-sync', ...result });
        }

        // Monthly analytics snapshot → monthly_metrics. Scheduled for 00:30 UTC
        // on the 1st (see vercel.json), capturing the month that just ended
        // while Meta's ~30-day account-insight retention still covers it. Runs
        // a best-effort per-post metrics-sync pass first so the month's post
        // aggregates are as fresh as possible (the intent of "after
        // metrics-sync" — the regular sync cron fires at :40, after this).
        // Optional ?month=YYYY-MM to (re)capture a specific past month.
        if (worker === 'monthly-snapshot') {
            console.log('[Cron] Capturing monthly metrics snapshot...');
            try {
                await syncSocialMetrics(100);
            } catch (e) {
                console.error('[Cron] monthly-snapshot: pre-sync failed (continuing):', e);
            }
            const { captureMonthlySnapshot } = await import('@/lib/analytics/monthly-snapshot');
            const month = searchParams.get('month'); // YYYY-MM or YYYY-MM-DD, optional
            const result = await captureMonthlySnapshot(month ? `${month.slice(0, 7)}-01` : undefined);
            return NextResponse.json({
                success: result.ok,
                worker: 'monthly-snapshot',
                month: result.month,
                reason: result.reason,
                analysis: result.row?.analysis,
            });
        }

        // Weekly Forecast newsletter (B5). Composes the last 7 days of
        // confirmed news and, by default, sends a PREVIEW to the owner only.
        // The real list only receives it when NEWSLETTER_AUTO_SEND=true is
        // set in the environment, so nothing reaches subscribers until the
        // owner has approved the format.
        if (worker === 'newsletter') {
            console.log('[Cron] Composing The Forecast newsletter...');
            try {
                const { composeForecast } = await import('@/lib/email/newsletter');
                const { subject, html, text, itemCount } = await composeForecast();

                if (itemCount === 0) {
                    return NextResponse.json({ success: true, worker: 'newsletter', skipped: 'no items this week' });
                }

                if (process.env.NEWSLETTER_AUTO_SEND === 'true') {
                    // Record the broadcast so the admin Email tab history stays
                    // accurate (same pattern as /api/admin/email/send). The
                    // insert is best-effort: a bookkeeping failure must not
                    // block the weekly send.
                    let broadcastId: string | null = null;
                    try {
                        const { data: broadcast } = await supabaseAdmin
                            .from('email_broadcasts')
                            .insert({ subject, body_html: html, body_text: text, status: 'sending' })
                            .select('id')
                            .single();
                        broadcastId = broadcast?.id ?? null;
                    } catch (e) {
                        console.error('[Cron] Newsletter: could not record email_broadcasts row:', e);
                    }

                    const { sendBroadcast } = await import('@/lib/email/send');
                    let result;
                    try {
                        result = await sendBroadcast({ subject, html, text, kind: 'forecast' });
                    } catch (sendErr) {
                        if (broadcastId) {
                            await supabaseAdmin.from('email_broadcasts').update({ status: 'failed' }).eq('id', broadcastId);
                        }
                        throw sendErr;
                    }

                    if (broadcastId) {
                        await supabaseAdmin
                            .from('email_broadcasts')
                            .update({
                                status: result.failed > 0 && result.sent === 0 ? 'failed' : 'sent',
                                sent_count: result.sent,
                                sent_at: new Date().toISOString(),
                            })
                            .eq('id', broadcastId);
                    }

                    return NextResponse.json({
                        success: true,
                        worker: 'newsletter',
                        mode: 'broadcast',
                        itemCount,
                        sent: result.sent,
                        failed: result.failed,
                    });
                }

                // Preview path: owner-only, so the list stays untouched.
                const { Resend } = await import('resend');
                const apiKey = process.env.RESEND_API_KEY;
                if (!apiKey) {
                    return NextResponse.json({
                        success: false,
                        worker: 'newsletter',
                        mode: 'preview',
                        itemCount,
                        error: 'RESEND_API_KEY is not set',
                    });
                }
                const resend = new Resend(apiKey);
                const previewTo = process.env.NEWSLETTER_PREVIEW_TO || 'gonxjose98@gmail.com';
                const { error: sendError } = await resend.emails.send({
                    from: 'KumoLab <news@kumolabanime.com>',
                    to: previewTo,
                    subject: `[PREVIEW] ${subject}`,
                    html,
                    text,
                });
                if (sendError) {
                    return NextResponse.json({
                        success: false,
                        worker: 'newsletter',
                        mode: 'preview',
                        itemCount,
                        error: sendError.message,
                    });
                }
                return NextResponse.json({
                    success: true,
                    worker: 'newsletter',
                    mode: 'preview',
                    itemCount,
                    previewTo,
                });
            } catch (e: any) {
                console.error('[Cron] Newsletter worker failed:', e);
                return NextResponse.json({
                    success: false,
                    worker: 'newsletter',
                    error: e?.message || 'newsletter exception',
                });
            }
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

        // Server-to-server image regen: cron-bearer-authed (same trust level as
        // any cron task). Single post or comma-separated batch via ?postIds=.
        if (worker === 'render') {
            const idsParam = searchParams.get('postIds') || searchParams.get('postId');
            if (!idsParam) {
                return NextResponse.json({ error: 'postIds query param is required' }, { status: 400 });
            }
            const ids = idsParam.split(',').map(s => s.trim()).filter(Boolean);
            const results: any[] = [];

            for (const postId of ids) {
                try {
                    const { data: post, error: fetchError } = await supabaseAdmin
                        .from('posts')
                        .select('id, slug, title, excerpt, image, source_url, image_settings')
                        .eq('id', postId)
                        .single();
                    if (fetchError || !post) {
                        results.push({ id: postId, success: false, error: fetchError?.message || 'Post not found' });
                        continue;
                    }

                    // Source priority for re-render:
                    //   1. ?sourceUrl= query (manual override)
                    //   2. post.image_settings.sourceUrl (the source last
                    //      approved by the user — this is what we want)
                    //   3. post.image (current value; may be the rendered
                    //      bake itself, so this is a last resort)
                    const saved: any = post.image_settings || {};
                    const sourceUrl = (searchParams.get('sourceUrl')) || saved.sourceUrl || post.image;
                    if (!sourceUrl) {
                        results.push({ id: postId, success: false, error: 'no source to render from' });
                        continue;
                    }

                    // Settings priority: ?text/gradient/watermark/gradPos
                    // query params override the saved settings on a per-call
                    // basis (useful for ad-hoc testing). Otherwise we render
                    // EXACTLY what the user approved last time.
                    const qpOr = <T>(qp: string | null, fallback: T): boolean | T => {
                        if (qp === null) return fallback;
                        return qp === '1' || qp === 'true';
                    };
                    const rendered = await generateIntelImage({
                        sourceUrl,
                        animeTitle: post.title || '',
                        headline: (post.excerpt || '').toString(),
                        slug: post.slug || `post-${postId}`,
                        applyText: qpOr(searchParams.get('text'), saved.applyText ?? true) as boolean,
                        applyGradient: qpOr(searchParams.get('gradient'), saved.applyGradient ?? true) as boolean,
                        applyWatermark: qpOr(searchParams.get('watermark'), saved.applyWatermark ?? true) as boolean,
                        gradientPosition: (searchParams.get('gradPos') as 'top' | 'bottom') || saved.gradientPosition || 'bottom',
                        gradientStrength: saved.gradientStrength,
                        titleScale: saved.titleScale,
                        captionScale: saved.captionScale,
                        titleOffset: saved.titleOffset,
                        captionOffset: saved.captionOffset,
                        purpleWordIndices: saved.purpleWordIndices ?? [],
                        watermarkPosition: saved.watermarkPosition ?? undefined,
                        classification: 'CLEAN',
                        bypassSafety: true,
                    });

                    if (!rendered?.processedImage) {
                        results.push({ id: postId, success: false, error: 'renderer returned null' });
                        continue;
                    }

                    const { error: updateError } = await supabaseAdmin
                        .from('posts')
                        .update({ image: rendered.processedImage })
                        .eq('id', postId);
                    if (updateError) {
                        results.push({ id: postId, success: false, error: updateError.message });
                        continue;
                    }

                    results.push({ id: postId, success: true, image: rendered.processedImage });
                } catch (e: any) {
                    results.push({ id: postId, success: false, error: e?.message || 'render exception' });
                }
            }

            return NextResponse.json({
                success: results.every(r => r.success),
                worker: 'render',
                results,
            });
        }

        return NextResponse.json({
            error: 'Invalid worker parameter.',
            valid_workers: ['detection', 'processing', 'publish', 'dailydrops', 'daily-report', 'cleanup', 'render', 'refresh-meta-token', 'refresh-threads-token', 'republish-social', 'metrics-sync', 'monthly-snapshot', 'health-monitor', 'newsletter']
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
