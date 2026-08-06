/**
 * tt-status.mjs — read the TikTok content manager and report each recent post's
 * privacy + review state.
 *
 * Why this exists: a post held as "Only me / Content under review" is
 * indistinguishable from a successful post everywhere else in our system. The
 * upload succeeded, the queue row says posted, and nobody can see the video.
 * This is the only way to catch that, and it's the KumoLab failure mode —
 * silent decay, not broken code.
 *
 * Usage:
 *   node scripts/tiktok/tt-status.mjs [--n 5] [--headless]
 *
 * Exit codes: 0 all recent posts public · 3 at least one is private/under review
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { SESSION_PATH, OUT_DIR, SessionExpiredError } from './tt-post.mjs';

const args = process.argv.slice(2);
const nIdx = args.indexOf('--n');
const N = nIdx >= 0 ? Math.max(1, parseInt(args[nIdx + 1], 10) || 5) : 5;
const HEADLESS = args.includes('--headless');

const log = (...a) => console.log('[tt-status]', ...a);

if (!existsSync(SESSION_PATH)) {
    console.error(`[tt-status] no session at ${SESSION_PATH} — run tt-capture.mjs`);
    process.exit(2);
}

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: HEADLESS, args: ['--disable-blink-features=AutomationControlled'] });
let exitCode = 0;

try {
    const context = await browser.newContext({
        storageState: SESSION_PATH,
        viewport: { width: 1280, height: 900 },
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    await page.goto('https://www.tiktok.com/tiktokstudio/content', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);
    if (/login/i.test(page.url())) throw new SessionExpiredError('redirected to login');

    await page.screenshot({ path: resolve(OUT_DIR, 'status-content-manager.png'), fullPage: true }).catch(() => {});

    // Parse the rendered text rather than the DOM. TikTok's class names are
    // hashed and change constantly; the visible layout of the table does not.
    // Each row reads: duration ("00:23") → caption → date → privacy → counts,
    // with "Content under review" appearing in the row when it's held.
    const lines = (await page.locator('body').innerText())
        .split('\n').map((s) => s.trim()).filter(Boolean);

    let reported = 0;
    for (let i = 0; i < lines.length && reported < N; i++) {
        if (!/^\d{1,2}:\d{2}$/.test(lines[i])) continue;   // row starts at the duration
        const window = lines.slice(i, i + 7);
        const caption = window[1] || '';
        const privacy = (window.find((l) => /^(Only me|Everyone|Friends)$/i.test(l)) || '?');
        const date = window.find((l) => /^[A-Z][a-z]{2} \d{1,2},/.test(l)) || '';
        const underReview = window.some((l) => /Content under review/i.test(l));

        // Counts follow the privacy cell: views, likes, comments.
        const pIdx = window.findIndex((l) => /^(Only me|Everyone|Friends)$/i.test(l));
        const counts = pIdx >= 0
            ? window.slice(pIdx + 1).filter((l) => /^[\d,]+$/.test(l)).slice(0, 3)
            : [];
        const [views = '?', likes = '?'] = counts;

        const title = caption.slice(0, 45);
        const stats = `${views} views, ${likes} likes`;
        if (underReview || /only me/i.test(privacy)) {
            exitCode = 3;
            log(`⚠ ${privacy}${underReview ? ' + UNDER REVIEW' : ''} — ${date} — ${stats} — ${title}`);
        } else {
            log(`✓ ${privacy} — ${date} — ${stats} — ${title}`);
        }
        reported++;
    }

    if (reported === 0) log('no rows parsed — see out/status-content-manager.png');
    if (exitCode === 3) log('\nAt least one recent post is NOT publicly visible.');
} catch (e) {
    if (e instanceof SessionExpiredError) {
        console.error('[tt-status] session expired — run: node scripts/tiktok/tt-capture.mjs');
        exitCode = 2;
    } else {
        console.error('[tt-status] failed:', e?.message || e);
        exitCode = 1;
    }
} finally {
    await browser.close().catch(() => {});
}

process.exitCode = exitCode;
