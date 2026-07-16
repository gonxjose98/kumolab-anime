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

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../../.credentials/tiktok-session.json');
const TIMEOUT_MIN = 8;

// TikTok sets these cookies once you're logged in.
function isLoggedIn(cookies) {
    return cookies.some((c) => c.name === 'sessionid' && c.value) ||
           cookies.some((c) => c.name === 'sid_tt' && c.value);
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
    console.log(`Waiting up to ${TIMEOUT_MIN} min for login — it saves automatically the moment you're in.\n`);
    await page.goto('https://www.tiktok.com/login', { waitUntil: 'domcontentloaded' }).catch(() => {});

    // Auto-detect login by polling for the session cookies (no Enter needed, so
    // this also works when launched via `! node ...`). Saves + exits on success.
    const deadline = Date.now() + TIMEOUT_MIN * 60_000;
    let saved = false;
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3000));
        const cookies = await context.cookies().catch(() => []);
        if (isLoggedIn(cookies)) {
            await new Promise((r) => setTimeout(r, 2500)); // let the rest settle
            await context.storageState({ path: OUT });
            console.log(`\n✅ Logged-in session saved to ${OUT}`);
            console.log('   Keep it secret (gitignored). Next: node scripts/tiktok/tt-upload.mjs <video> "<caption>" --dry\n');
            saved = true;
            break;
        }
    }
    if (!saved) console.log('\n⏱  Timed out without detecting a login. Re-run and finish the login within the window.\n');

    await browser.close();
    process.exit(saved ? 0 : 1);
})().catch((e) => {
    console.error('capture failed:', e);
    process.exit(1);
});
