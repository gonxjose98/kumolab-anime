/**
 * tt-upload.mjs — post ONE video to TikTok from the command line.
 *
 * Thin wrapper over tt-post.mjs (which holds the actual browser flow, shared
 * with the scheduled tt-runner.mjs). Use this for testing selectors after a
 * TikTok DOM change, or for a manual one-off post.
 *
 * Usage (from workspace-kumolab):
 *   node scripts/tiktok/tt-upload.mjs <video> "<caption>" [--dry] [--headless]
 *     <video>    local path OR https URL (e.g. a blog-videos bucket MP4)
 *     <caption>  the caption text (quote it)
 *     --dry      do everything EXCEPT click Post (safe end-to-end test)
 *     --headless run without a visible window (default: headful, more reliable)
 *
 * Screenshots of every phase land in scripts/tiktok/out/.
 */

import { postToTikTok, SessionExpiredError, OUT_DIR } from './tt-post.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const [video, caption = ''] = positional;

const log = (...a) => console.log('[tt-upload]', ...a);

try {
    const r = await postToTikTok({
        video,
        caption,
        dry: flags.has('--dry'),
        headless: flags.has('--headless'),
        log,
    });
    if (r.dry) {
        log(`dry run OK — review ${OUT_DIR}/4-dry-ready-to-post.png`);
    } else {
        log(`posted — verify on the @kumolabanime profile that it went live (screenshots in ${OUT_DIR}).`);
    }
    process.exit(0);
} catch (e) {
    if (e instanceof SessionExpiredError) {
        console.error('[tt-upload] SESSION EXPIRED:', e.message);
        console.error('[tt-upload] fix: node scripts/tiktok/tt-capture.mjs');
        process.exit(2);
    }
    console.error('[tt-upload] FAILED:', e?.message || e);
    process.exit(1);
}
