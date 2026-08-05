/**
 * tiktok-publisher.ts
 *
 * TikTok has no API path for us. Three developer-app submissions were rejected,
 * so first-party automation of @kumolabanime via the Content Posting API is off
 * the table permanently. This module used to hold that API client; it now
 * ENQUEUES a job instead.
 *
 * The real posting happens outside Vercel: `scripts/tiktok/tt-runner.mjs` runs
 * on Jose's PC (Windows Task Scheduler), pulls pending rows from tiktok_queue,
 * and drives the actual TikTok Studio web upload with Playwright using a saved
 * login session. Running it from home matters — TikTok treats a session that
 * suddenly appears from a datacenter IP as a takeover and silently logs it out.
 *
 * See scripts/tiktok/README.md for the runbook.
 */

import { supabaseAdmin } from '../supabase/admin';
import { logError } from '../logging/structured-logger';

export interface TikTokEnqueueInput {
    postId?: string | null;
    slug?: string | null;
    title: string;
    /** Public bucket URL of the MP4 that was just published to Instagram. */
    videoUrl: string;
    /** The exact caption Instagram received, so the two platforms stay in sync. */
    caption: string;
}

export interface TikTokEnqueueResult {
    queued?: boolean;
    skipped?: string;
    error?: string;
}

/**
 * Queue a video for the local TikTok runner to post.
 *
 * Upserts on post_id: a republish must not queue the same post twice. An
 * already-posted row is left alone — re-queueing it would double-post to
 * TikTok, which is exactly the failure the per-post lock in publishToSocials
 * exists to prevent on the other platforms.
 */
export async function enqueueTikTokPost(input: TikTokEnqueueInput): Promise<TikTokEnqueueResult> {
    if (process.env.TIKTOK_QUEUE_ENABLED !== 'true') {
        return { skipped: 'TIKTOK_QUEUE_ENABLED not "true" — TikTok queueing disabled' };
    }
    if (!input.videoUrl) {
        return { skipped: 'no staged video URL' };
    }

    try {
        if (input.postId) {
            // Don't disturb a row the runner already acted on. Only a pending or
            // failed job gets its content refreshed (the video URL may have been
            // re-staged); posted stays posted.
            const { data: existing } = await supabaseAdmin
                .from('tiktok_queue')
                .select('id, status')
                .eq('post_id', input.postId)
                .maybeSingle();

            if (existing) {
                if (existing.status === 'posted') {
                    return { skipped: 'already posted to TikTok' };
                }
                const { error } = await supabaseAdmin
                    .from('tiktok_queue')
                    .update({
                        video_url: input.videoUrl,
                        caption: input.caption,
                        title: input.title,
                        status: 'pending',
                        last_error: null,
                    })
                    .eq('id', existing.id);
                if (error) throw new Error(error.message);
                return { queued: true };
            }
        }

        const { error } = await supabaseAdmin.from('tiktok_queue').insert({
            post_id: input.postId || null,
            slug: input.slug || null,
            title: input.title,
            video_url: input.videoUrl,
            caption: input.caption,
            status: 'pending',
        });
        if (error) throw new Error(error.message);
        return { queued: true };
    } catch (e: any) {
        // Queueing is bookkeeping — never let it fail a publish that already
        // succeeded on IG/FB/Threads. Log it and move on.
        await logError({
            source: 'publisher.tiktok',
            errorMessage: `TikTok enqueue failed: ${e?.message || e}`,
            context: { post_id: input.postId, slug: input.slug },
        }).catch(() => {});
        return { error: e?.message || String(e) };
    }
}
