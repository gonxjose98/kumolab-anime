/**
 * tt-capture.mjs — one-time TikTok session capture.
 *
 * TikTok blocks automated logins (captcha + SMS 2FA), so a human logs in ONCE
 * in a real browser window and we save the authenticated session (cookies +
 * localStorage) to a gitignored file. The upload automation (tt-upload.mjs)
 * reuses that session so it never has to log in.
 *
 * Run (from workspace-kumolab):
 *   npm i -D playwright        # once
 *   npx playwright install chromium   # once
 *   node scripts/tiktok/tt-capture.mjs
 *
 * A Chromium window opens on tiktok.com. Log in as @kumolabanime (do the
 * SMS/2FA), make sure you land on the logged-in home/profile, then come back
 * to THIS terminal and press Enter. The session is written to
 * .credentials/tiktok-session.json (never committed). Re-run this whenever the
 * session expires (weeks/months) or you get logged out.
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import readline from 'node:readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../../.credentials/tiktok-session.json');

function waitForEnter(prompt) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((res) => rl.question(prompt, () => { rl.close(); res(); }));
}

(async () => {
    mkdirSync(resolve(__dirname, '../../.credentials'), { recursive: true });

    // Headful + a normal-looking UA/viewport. TikTok is picky about headless.
    const browser = await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled'] });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    console.log('\nOpening TikTok. Log in as @kumolabanime in the browser window (do the SMS/2FA).');
    await page.goto('https://www.tiktok.com/login', { waitUntil: 'domcontentloaded' }).catch(() => {});

    await waitForEnter(
        '\n>>> After you are fully logged in (you can see your profile/home feed), press Enter here to save the session... ',
    );

    await context.storageState({ path: OUT });
    console.log(`\n✅ Session saved to ${OUT}`);
    console.log('   Keep it secret (it is gitignored). Next: node scripts/tiktok/tt-upload.mjs <video> "<caption>"\n');

    await browser.close();
    process.exit(0);
})().catch((e) => {
    console.error('capture failed:', e);
    process.exit(1);
});
