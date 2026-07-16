/**
 * tt-upload.mjs — upload a video to TikTok via the web UI, reusing the saved
 * session from tt-capture.mjs. This is the browser-automation path (TikTok's
 * API rejects first-party automation, so we drive the real upload page).
 *
 * Usage (from workspace-kumolab):
 *   node scripts/tiktok/tt-upload.mjs <video> "<caption>" [--dry] [--headless]
 *     <video>   local path OR https URL (e.g. the blog-videos bucket MP4)
 *     <caption> the caption text (quote it)
 *     --dry     do everything EXCEPT click Post (safe end-to-end test)
 *     --headless run without a visible window (default: headful, more reliable)
 *
 * TikTok's upload DOM changes often. This uses resilient, multi-fallback
 * selectors and screenshots each phase to scripts/tiktok/out/ so we can see
 * exactly where it is and refine selectors against the live page. Start with
 * --dry to validate the flow before a real post.
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSION = resolve(__dirname, '../../.credentials/tiktok-session.json');
const OUTDIR = resolve(__dirname, 'out');

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const [videoArg, caption = ''] = positional;
const DRY = flags.has('--dry');
const HEADLESS = flags.has('--headless');

const UPLOAD_URLS = [
    'https://www.tiktok.com/tiktokstudio/upload',
    'https://www.tiktok.com/upload?lang=en',
];

function log(...a) { console.log('[tt-upload]', ...a); }
async function shot(page, name) {
    try { await page.screenshot({ path: resolve(OUTDIR, `${name}.png`), fullPage: true }); log('screenshot', `${name}.png`); } catch {}
}

async function resolveVideo(arg) {
    if (!arg) throw new Error('missing <video> arg (local path or https URL)');
    if (/^https?:\/\//i.test(arg)) {
        log('downloading', arg);
        const r = await fetch(arg);
        if (!r.ok) throw new Error(`download failed: HTTP ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        const p = resolve(tmpdir(), `tt-${Date.now()}-${basename(new URL(arg).pathname) || 'video.mp4'}`);
        writeFileSync(p, buf);
        log('saved', p, `(${buf.length} bytes)`);
        return p;
    }
    if (!existsSync(arg)) throw new Error(`local video not found: ${arg}`);
    return resolve(arg);
}

/** Try a list of selectors, return the first that resolves within timeout. */
async function firstVisible(scope, selectors, timeout = 8000) {
    for (const sel of selectors) {
        const loc = scope.locator(sel).first();
        try { await loc.waitFor({ state: 'visible', timeout: timeout / selectors.length }); return loc; } catch {}
    }
    return null;
}

(async () => {
    mkdirSync(OUTDIR, { recursive: true });
    if (!existsSync(SESSION)) throw new Error(`no session file at ${SESSION} — run tt-capture.mjs first`);
    const video = await resolveVideo(videoArg);

    const browser = await chromium.launch({ headless: HEADLESS, args: ['--disable-blink-features=AutomationControlled'] });
    const context = await browser.newContext({
        storageState: SESSION,
        viewport: { width: 1280, height: 900 },
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    // 1) Open the upload page (Studio first, then the legacy path).
    let opened = false;
    for (const u of UPLOAD_URLS) {
        try { await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 }); opened = true; break; } catch {}
    }
    if (!opened) throw new Error('could not open any TikTok upload URL');
    await page.waitForTimeout(3000);
    await shot(page, '1-upload-page');
    if (/login/i.test(page.url())) throw new Error('redirected to login — session expired, re-run tt-capture.mjs');

    // 2) Set the video file. The upload page (and its iframe, if any) exposes an
    //    <input type=file>. setInputFiles works even on hidden inputs.
    const fileInput =
        (await firstVisible(page, ['input[type="file"]'], 4000).catch(() => null)) ||
        page.locator('input[type="file"]').first();
    // Handle a possible iframe-based uploader too.
    let usedFrame = false;
    if (!(await page.locator('input[type="file"]').count())) {
        for (const f of page.frames()) {
            if (await f.locator('input[type="file"]').count()) {
                await f.locator('input[type="file"]').first().setInputFiles(video);
                usedFrame = true; break;
            }
        }
        if (!usedFrame) throw new Error('no file input found on the upload page (see 1-upload-page.png)');
    } else {
        await fileInput.setInputFiles(video);
    }
    log('video set, waiting for TikTok to ingest…');
    await page.waitForTimeout(12000);
    await shot(page, '2-after-file');

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
            log('caption typed');
        } else {
            log('WARN: caption editor not found — posting without a set caption');
        }
    }
    await page.waitForTimeout(2000);
    await shot(page, '3-caption');

    // 4) Post. Wait until the Post button is enabled (video finished processing).
    const postBtn = await firstVisible(page, [
        'button[data-e2e="post_video_button"]',
        'button:has-text("Post")',
        'div[data-e2e="post_video_button"] button',
    ], 20000);
    if (!postBtn) { await shot(page, '4-no-post-button'); throw new Error('Post button not found (see screenshots)'); }

    // Wait for it to become enabled (TikTok disables Post until ingest completes).
    for (let i = 0; i < 30; i++) {
        const disabled = await postBtn.getAttribute('disabled');
        const aria = await postBtn.getAttribute('aria-disabled');
        if (!disabled && aria !== 'true') break;
        await page.waitForTimeout(2000);
    }

    if (DRY) {
        await shot(page, '4-dry-ready-to-post');
        log('DRY RUN — everything is ready; NOT clicking Post. Review out/4-dry-ready-to-post.png');
        await browser.close();
        process.exit(0);
    }

    await postBtn.click();
    log('clicked Post, waiting for confirmation…');
    await page.waitForTimeout(8000);
    await shot(page, '5-after-post');
    // TikTok usually shows a success toast / redirects to the content manager.
    log('done — verify on the TikTok profile that the post went live (screenshots in out/).');

    await browser.close();
    process.exit(0);
})().catch((e) => {
    console.error('[tt-upload] FAILED:', e.message || e);
    process.exit(1);
});
