/**
 * tt-post.mjs — the actual TikTok web-upload flow, as a reusable function.
 *
 * Both entry points share this one code path on purpose:
 *   tt-upload.mjs  — manual CLI, one video, for testing and one-offs
 *   tt-runner.mjs  — scheduled runner, drains the tiktok_queue table
 *
 * TikTok's upload DOM shifts every few weeks. When it breaks, the selectors get
 * fixed HERE and both callers are fixed at once. Keeping two copies would mean
 * the scheduled path silently rotting while the CLI (the one we actually watch)
 * looks fine.
 *
 * Every phase screenshots to `out/` so a failure can be diagnosed from what the
 * page actually looked like, not from a stack trace.
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const SESSION_PATH = resolve(__dirname, '../../.credentials/tiktok-session.json');
export const OUT_DIR = resolve(__dirname, 'out');

const UPLOAD_URLS = [
    'https://www.tiktok.com/tiktokstudio/upload',
    'https://www.tiktok.com/upload?lang=en',
];

/**
 * A dead login session is NOT a normal failure. It means every remaining job
 * will fail the same way, and the fix is Jose re-running tt-capture.mjs — not a
 * retry. Callers check for this to stop the batch and leave jobs pending
 * instead of burning their attempt counter.
 */
export class SessionExpiredError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SessionExpiredError';
        this.sessionExpired = true;
    }
}

/** Download an https video to a temp file. Returns [path, isTemp]. */
async function resolveVideo(arg, log) {
    if (!arg) throw new Error('missing video (local path or https URL)');
    if (/^https?:\/\//i.test(arg)) {
        log('downloading', arg);
        const r = await fetch(arg);
        if (!r.ok) throw new Error(`download failed: HTTP ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length === 0) throw new Error('downloaded video is empty');
        const name = basename(new URL(arg).pathname) || 'video.mp4';
        const p = resolve(tmpdir(), `tt-${Date.now()}-${name}`);
        writeFileSync(p, buf);
        log('saved', p, `(${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
        return [p, true];
    }
    if (!existsSync(arg)) throw new Error(`local video not found: ${arg}`);
    return [resolve(arg), false];
}

/** Try a list of selectors, return the first that resolves within timeout. */
async function firstVisible(scope, selectors, timeout = 8000) {
    for (const sel of selectors) {
        const loc = scope.locator(sel).first();
        try { await loc.waitFor({ state: 'visible', timeout: timeout / selectors.length }); return loc; } catch {}
    }
    return null;
}

/**
 * Dismiss the popups TikTok Studio throws over the upload page: the onboarding
 * product tour (react-joyride) and modals like "Turn on automatic content
 * checks?". Only ever clicks safe dismiss controls (Cancel / Skip / × / Not
 * now) — never "Turn on" / "Allow", so the account's settings are unchanged.
 */
async function dismissOverlays(page) {
    for (let pass = 0; pass < 4; pass++) {
        let acted = false;
        const tryClick = async (loc) => {
            try {
                if ((await loc.count()) && (await loc.first().isVisible().catch(() => false))) {
                    await loc.first().click({ timeout: 2000 }); return true;
                }
            } catch {}
            return false;
        };
        // react-joyride onboarding tour
        for (const sel of ['button[data-action="skip"]', 'button[data-action="close"]', '.react-joyride__tooltip button']) {
            if (await tryClick(page.locator(sel))) acted = true;
        }
        // modal dismiss buttons by label (safe choices only)
        for (const txt of ['Cancel', 'Not now', 'Maybe later', 'Got it', 'Skip', 'Skip all', 'No thanks']) {
            if (await tryClick(page.getByRole('button', { name: txt, exact: true }))) acted = true;
        }
        // generic close (X) controls
        for (const sel of ['[data-e2e="modal-close-inner-button"]', 'button[aria-label="Close"]', '.TUXModal button[aria-label="Close"]']) {
            if (await tryClick(page.locator(sel))) acted = true;
        }
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(600);
        if (!acted) break;
    }
}

/**
 * Post one video to TikTok.
 *
 * @param {object}  opts
 * @param {string}  opts.video     local path or https URL
 * @param {string}  opts.caption
 * @param {boolean} [opts.dry]     do everything except click Post
 * @param {boolean} [opts.headless]
 * @param {string}  [opts.prefix]  screenshot filename prefix (keeps concurrent
 *                                 or sequential jobs from overwriting each other)
 * @param {function}[opts.log]
 * @returns {Promise<{posted: boolean, dry?: boolean, url: string|null}>}
 * @throws  {SessionExpiredError} when TikTok bounces us to login
 */
export async function postToTikTok({ video, caption = '', dry = false, headless = false, prefix = '', log = console.log }) {
    mkdirSync(OUT_DIR, { recursive: true });
    if (!existsSync(SESSION_PATH)) {
        throw new SessionExpiredError(`no session file at ${SESSION_PATH} — run tt-capture.mjs first`);
    }

    const shot = async (name) => {
        try {
            await page.screenshot({ path: resolve(OUT_DIR, `${prefix}${name}.png`), fullPage: true });
        } catch {}
    };

    const [videoPath, isTemp] = await resolveVideo(video, log);
    let page;
    const browser = await chromium.launch({
        headless,
        args: ['--disable-blink-features=AutomationControlled'],
    });

    try {
        const context = await browser.newContext({
            storageState: SESSION_PATH,
            viewport: { width: 1280, height: 900 },
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        });
        page = await context.newPage();

        // 1) Open the upload page (Studio first, then the legacy path).
        let opened = false;
        for (const u of UPLOAD_URLS) {
            try { await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 }); opened = true; break; } catch {}
        }
        if (!opened) throw new Error('could not open any TikTok upload URL');
        await page.waitForTimeout(3000);
        await shot('1-upload-page');
        if (/login/i.test(page.url())) {
            throw new SessionExpiredError('redirected to login — session expired, re-run tt-capture.mjs');
        }

        // 2) Set the video file. The upload page (and its iframe, if any) exposes
        //    an <input type=file>. setInputFiles works even on hidden inputs.
        if (!(await page.locator('input[type="file"]').count())) {
            let usedFrame = false;
            for (const f of page.frames()) {
                if (await f.locator('input[type="file"]').count()) {
                    await f.locator('input[type="file"]').first().setInputFiles(videoPath);
                    usedFrame = true; break;
                }
            }
            if (!usedFrame) throw new Error('no file input found on the upload page (see 1-upload-page.png)');
        } else {
            await page.locator('input[type="file"]').first().setInputFiles(videoPath);
        }
        log('video set, waiting for TikTok to ingest…');
        await page.waitForTimeout(12000);
        await shot('2-after-file');

        // 2b) Clear TikTok Studio's onboarding tour + the "automatic content
        //     checks" modal, which sit over the caption box and intercept clicks.
        await dismissOverlays(page);
        await shot('2b-after-dismiss');

        // 3) Caption. TikTok uses a DraftJS contenteditable. Clear + type.
        if (caption) {
            const cap = await firstVisible(page, [
                'div[contenteditable="true"]',
                'div[data-e2e="upload-caption"] div[contenteditable="true"]',
                '[data-contents="true"] div[contenteditable="true"]',
            ], 15000);
            if (cap) {
                await cap.click();
                await page.keyboard.press('Control+A').catch(() => {});
                await page.keyboard.press('Delete').catch(() => {});
                await page.keyboard.type(caption, { delay: 8 });
                // Every caption buildSocialCaption produces ENDS in hashtags, so
                // TikTok's hashtag autocomplete is guaranteed to be open right
                // now — a tall dropdown sitting over the settings and the Post
                // button. Escape closes it; clicking a neutral heading takes
                // focus out of the editor so it can't reopen. Without this the
                // suggestion list is on screen at click time on EVERY post.
                await page.keyboard.press('Escape').catch(() => {});
                await page.locator('text=Details').first().click({ timeout: 3000 }).catch(() => {});
                await page.waitForTimeout(500);
                log('caption typed');
            } else {
                log('WARN: caption editor not found — posting without a set caption');
            }
        }
        await page.waitForTimeout(2000);
        await shot('3-caption');

        // 3b) Capture the visibility setting, which sits below the fold.
        //
        // The July 2026 test posts landed as "Only me / Content under review"
        // despite Everyone being selected — and a post nobody can see looks
        // identical to a successful one from up here. Read the control and log
        // it so a silent switch to private is visible in the run output instead
        // of being discovered weeks later. We only READ it; changing account
        // defaults from a script is how you get surprising posts.
        try {
            await page.mouse.wheel(0, 1400);
            await page.waitForTimeout(1200);
            const visRow = page.locator('text=/Who can (see this post|watch this video)/i').first();
            if (await visRow.count()) {
                // The label and its dropdown value live in different nodes, and
                // how many levels up they share an ancestor is TikTok's business
                // and changes. Climb until the text contains something BESIDES
                // the label — that something is the selected value.
                let flat = '';
                for (let up = 1; up <= 4; up++) {
                    const t = await visRow.locator(`xpath=${'../'.repeat(up).slice(0, -1)}`)
                        .innerText().catch(() => '');
                    const s = t.replace(/\s+/g, ' ').trim();
                    if (s.replace(/Who can (see this post|watch this video)/i, '').trim().length > 2) {
                        flat = s; break;
                    }
                }
                if (flat) log('visibility:', flat.slice(0, 120));
                if (/only you|only me|private/i.test(flat)) {
                    log('WARN: visibility looks PRIVATE — this post may not be publicly visible.');
                }
            } else {
                log('note: visibility control not found on the page (see 3b-settings.png)');
            }
            await shot('3b-settings');
        } catch {}

        // 4) Post. Clear any overlay that reappeared, then wait for the button.
        await dismissOverlays(page);
        const postBtn = await firstVisible(page, [
            'button[data-e2e="post_video_button"]',
            'button:has-text("Post")',
            'div[data-e2e="post_video_button"] button',
        ], 20000);
        if (!postBtn) { await shot('4-no-post-button'); throw new Error('Post button not found (see screenshots)'); }

        // Wait for it to become enabled (TikTok disables Post until ingest completes).
        for (let i = 0; i < 30; i++) {
            const disabled = await postBtn.getAttribute('disabled');
            const aria = await postBtn.getAttribute('aria-disabled');
            if (!disabled && aria !== 'true') break;
            await page.waitForTimeout(2000);
        }

        // 4b) Optionally wait out TikTok's "Content check lite" before posting.
        //
        // OFF BY DEFAULT, and the reason is worth keeping. The July 2026 test
        // posts landed as "Only me / Content under review", so the theory was
        // that posting mid-check causes the hold and waiting would avoid it.
        // Measured on a real post 2026-08-05: the check did NOT clear in 12
        // minutes, the post went out, landed "Only me / Content under review"
        // as before — and then flipped to "Everyone" on its own about 10
        // minutes later. The review hold is temporary and self-resolving, so
        // waiting bought nothing and cost 12 minutes per post.
        //
        // Kept behind an env var in case TikTok changes behaviour. Verify with
        // tt-status.mjs rather than assuming either way.
        const checkWaitMs = Number(process.env.TIKTOK_CONTENT_CHECK_WAIT_MS ?? 0);
        if (!dry && checkWaitMs > 0) {
            const started = Date.now();
            let cleared = false;
            while (Date.now() - started < checkWaitMs) {
                const inProgress = await page
                    .locator('text=/Checking in progress/i').count().catch(() => 0);
                if (!inProgress) { cleared = true; break; }
                const mins = ((Date.now() - started) / 60000).toFixed(1);
                log(`content check still running (${mins}m elapsed)…`);
                await page.waitForTimeout(30_000);
            }
            log(cleared
                ? `content check cleared after ${((Date.now() - started) / 60000).toFixed(1)}m`
                : 'WARN: content check did not clear in time — posting anyway (may land under review)');
            await shot('4a-after-content-check');
        }

        if (dry) {
            await shot('4-dry-ready-to-post');
            log('DRY RUN — everything is ready; NOT clicking Post.');
            return { posted: false, dry: true, url: null };
        }

        await postBtn.click();
        log('clicked Post…');
        await page.waitForTimeout(2500);

        // TikTok often shows a second confirmation ("Continue to post? … Post
        // now") while its content check is still running. Confirm it to actually
        // publish — without this the upload sits in limbo and never goes live.
        const postNow = await firstVisible(page, [
            'button:has-text("Post now")',
            'div[role="dialog"] button:has-text("Post now")',
        ], 6000);
        if (postNow) { await postNow.click().catch(() => {}); log('confirmed "Post now"'); }

        log('waiting for publish to finish…');
        await page.waitForTimeout(9000);
        await shot('5-after-post');

        // TikTok doesn't hand back the post URL at upload time — it redirects to
        // the content manager and the video is still processing. We record the
        // post as sent and leave the URL null rather than scrape a guess.
        return { posted: true, url: null };
    } finally {
        await browser.close().catch(() => {});
        if (isTemp) { try { unlinkSync(videoPath); } catch {} }
    }
}
