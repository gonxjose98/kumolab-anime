/**
 * tt-runner.mjs — drain the tiktok_queue table onto TikTok.
 *
 * This is the production TikTok path. It runs on Jose's PC under Windows Task
 * Scheduler, NOT on Vercel or Render: the saved TikTok session was captured
 * from this machine's IP, and TikTok treats the same session appearing from a
 * datacenter IP as an account takeover — the usual result is a silent logout or
 * a flagged account, not a clean error.
 *
 * The publisher enqueues a job whenever a post successfully lands on Instagram
 * ("whatever goes up on IG goes up on TikTok"), so this script never decides
 * WHAT to post — only that pending jobs get posted.
 *
 * HOW TO RUN
 *   cd workspace-kumolab
 *   node scripts/tiktok/tt-runner.mjs [--dry] [--headless] [--max N] [--once]
 *     --dry      run the full flow but never click Post; leaves jobs pending
 *     --headless no visible window (less reliable against TikTok's bot checks)
 *     --max N    cap posts this run (default 3)
 *     --once     process a single job and stop
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local,
 * and a valid .credentials/tiktok-session.json (see tt-capture.mjs).
 *
 * Exit codes: 0 ok (including "nothing to do") · 1 one or more jobs failed
 *             2 session expired — needs Jose to re-run tt-capture.mjs
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { postToTikTok, SessionExpiredError } from './tt-post.mjs';

dotenv.config({ path: '.env.local' });
dotenv.config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
    console.error('[tt-runner] Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (put them in .env.local).');
    process.exit(1);
}
const db = createClient(url, key);

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const DRY = flags.has('--dry');
const HEADLESS = flags.has('--headless');
const ONCE = flags.has('--once');
const maxIdx = args.indexOf('--max');
const MAX = ONCE ? 1 : (maxIdx >= 0 ? Math.max(1, parseInt(args[maxIdx + 1], 10) || 3) : 3);

// A job that keeps failing is a job that will keep failing — a rejected video,
// a caption TikTok won't accept, a dead bucket URL. Three tries, then it stops
// consuming the runner's budget and waits for a human.
const MAX_ATTEMPTS = 3;

// TikTok's own posting limits are generous, but a runaway queue (say a backfill
// that enqueued 40 posts) hammering the account in one session is exactly the
// pattern that gets an account flagged. The IG mirror keeps this at ~3/day
// naturally; this is the backstop for when it doesn't.
const PAUSE_BETWEEN_POSTS_MS = 90_000;

const log = (...a) => console.log(`[tt-runner ${new Date().toISOString()}]`, ...a);

/** Operational breadcrumb in action_logs, so failures surface in the admin. */
async function logAction(action, reason, details) {
    await db.from('action_logs').insert({
        action,
        actor: 'tt-runner',
        entity_type: 'tiktok_queue',
        entity_id: details?.job_id ?? null,
        entity_title: details?.title ?? null,
        reason,
        details,
    }).then(() => {}, () => {});
}

async function main() {
    const { data: jobs, error } = await db
        .from('tiktok_queue')
        .select('id, post_id, slug, title, video_url, caption, attempts')
        .eq('status', 'pending')
        .lt('attempts', MAX_ATTEMPTS)
        .order('created_at', { ascending: true })
        .limit(MAX);

    if (error) {
        console.error('[tt-runner] queue read failed:', error.message);
        process.exit(1);
    }
    if (!jobs || jobs.length === 0) {
        log('nothing pending — done.');
        return 0;
    }

    log(`${jobs.length} job(s) to post${DRY ? ' (DRY RUN)' : ''}`);
    let failures = 0;
    let posted = 0;

    for (const [i, job] of jobs.entries()) {
        log(`→ [${i + 1}/${jobs.length}] ${job.slug || job.id} — ${job.title || ''}`);

        // Claim the attempt BEFORE running. If this process is killed mid-post
        // (laptop sleeps, Task Scheduler timeout) the attempt is still counted,
        // so a job that reliably crashes the runner can't loop forever.
        await db.from('tiktok_queue').update({ attempts: job.attempts + 1 }).eq('id', job.id);

        try {
            const r = await postToTikTok({
                video: job.video_url,
                caption: job.caption || '',
                dry: DRY,
                headless: HEADLESS,
                prefix: `${job.slug || job.id}-`,
                log: (...a) => console.log('   ', ...a),
            });

            if (r.dry) {
                log('   dry run OK — job left pending');
                continue;
            }

            await db.from('tiktok_queue').update({
                status: 'posted',
                posted_at: new Date().toISOString(),
                tiktok_url: r.url,
                last_error: null,
            }).eq('id', job.id);
            await logAction('tiktok_posted', 'Posted to TikTok via the local Playwright runner', {
                job_id: job.id, post_id: job.post_id, slug: job.slug, title: job.title,
            });
            posted++;
            log('   posted ✓');
        } catch (e) {
            if (e instanceof SessionExpiredError) {
                // Don't burn this job — the failure is the session, not the
                // content. Hand the attempt back and stop the whole batch;
                // every remaining job would fail identically.
                await db.from('tiktok_queue').update({
                    attempts: job.attempts,
                    last_error: 'session expired — re-run tt-capture.mjs',
                }).eq('id', job.id);
                await logAction('tiktok_session_expired',
                    'TikTok login session expired — no posts can go out until it is re-captured',
                    { job_id: job.id, slug: job.slug, fix: 'node scripts/tiktok/tt-capture.mjs' });
                console.error('\n[tt-runner] SESSION EXPIRED — stopping.');
                console.error('[tt-runner] fix: node scripts/tiktok/tt-capture.mjs (log in as @kumolabanime)');
                return 2;
            }

            failures++;
            const msg = String(e?.message || e).slice(0, 500);
            const exhausted = job.attempts + 1 >= MAX_ATTEMPTS;
            await db.from('tiktok_queue').update({
                status: exhausted ? 'failed' : 'pending',
                last_error: msg,
            }).eq('id', job.id);
            await logAction('tiktok_post_failed',
                exhausted ? `TikTok post failed ${MAX_ATTEMPTS}x — giving up` : 'TikTok post failed — will retry',
                { job_id: job.id, post_id: job.post_id, slug: job.slug, title: job.title, error: msg });
            console.error(`    FAILED${exhausted ? ' (final)' : ''}:`, msg);
        }

        if (i < jobs.length - 1) {
            log(`   pausing ${PAUSE_BETWEEN_POSTS_MS / 1000}s before the next post…`);
            await new Promise((res) => setTimeout(res, PAUSE_BETWEEN_POSTS_MS));
        }
    }

    // Count actual posts, not "everything that didn't fail" — a dry run posts
    // nothing yet would otherwise report the whole batch as published.
    log(`done — ${posted} posted, ${failures} failed${DRY ? `, ${jobs.length - failures} dry-run OK (still pending)` : ''}.`);
    return failures > 0 ? 1 : 0;
}

// Set exitCode and let the event loop drain rather than calling process.exit().
// A hard exit() while supabase-js still has an in-flight handle trips a libuv
// assertion on Windows ("!(handle->flags & UV_HANDLE_CLOSING)") which aborts
// the process with code 127 — Task Scheduler would then report a crash on every
// single run, including the clean "nothing pending" ones.
main()
    .then((code) => { process.exitCode = code; })
    .catch((e) => {
        console.error('[tt-runner] fatal:', e?.message || e);
        process.exitCode = 1;
    });
