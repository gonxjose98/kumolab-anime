/**
 * tt-public-check.mjs — look at @kumolabanime the way a STRANGER does.
 *
 * The content manager is the account's own view, and it will happily report
 * "Everyone" for a post that TikTok has quietly excluded from distribution.
 * This opens the public profile with NO session at all, so what it sees is what
 * an ordinary viewer sees.
 *
 * Usage: node scripts/tiktok/tt-public-check.mjs [--handle kumolabanime] [--headless]
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { OUT_DIR } from './tt-post.mjs';

const args = process.argv.slice(2);
const hIdx = args.indexOf('--handle');
const HANDLE = hIdx >= 0 ? args[hIdx + 1] : 'kumolabanime';
const HEADLESS = args.includes('--headless');

const log = (...a) => console.log('[tt-public]', ...a);
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: HEADLESS, args: ['--disable-blink-features=AutomationControlled'] });
try {
    // Deliberately NO storageState — a clean, logged-out visitor.
    const context = await browser.newContext({
        viewport: { width: 1280, height: 1000 },
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    await page.goto(`https://www.tiktok.com/@${HANDLE}`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: resolve(OUT_DIR, 'public-profile.png'), fullPage: false }).catch(() => {});

    const body = await page.locator('body').innerText().catch(() => '');
    if (/captcha|verify to continue|too many attempts/i.test(body)) {
        log('bot wall / captcha — cannot check anonymously right now (see out/public-profile.png)');
        process.exitCode = 1;
    } else {
        // Each grid tile carries a view count; the newest posts are first.
        const counts = await page.locator('[data-e2e="video-views"], strong[data-e2e="video-views"]')
            .allInnerTexts().catch(() => []);
        const followers = (body.match(/([\d.,KMB]+)\s*Followers/i) || [])[1] || '?';
        log(`followers: ${followers}`);
        log(`videos visible to a logged-out viewer: ${counts.length}`);
        if (counts.length) log(`view counts (newest first): ${counts.slice(0, 10).join(' · ')}`);
        else log('NO videos visible publicly — see out/public-profile.png');
    }
} catch (e) {
    console.error('[tt-public] failed:', e?.message || e);
    process.exitCode = 1;
} finally {
    await browser.close().catch(() => {});
}
