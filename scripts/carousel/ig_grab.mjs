// Open a visible browser on an Instagram post, wait for a manual login, then
// screenshot every carousel slide (reference only, never reposted).
//
// Usage (repo root): node scripts/carousel/ig_grab.mjs <postUrl> <outdir>
// The login session is kept in %TEMP%/kl-ig-profile so later runs skip login.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const [url, outArg] = process.argv.slice(2);
const out = resolve(outArg); mkdirSync(out, { recursive: true });
const ctx = await chromium.launchPersistentContext(join(tmpdir(), 'kl-ig-profile'), { headless: false, viewport: { width: 1200, height: 1000 } });
const p = ctx.pages()[0] || await ctx.newPage();
await p.goto(url);
console.log('Log in in the browser window if asked. Waiting up to 10 min...');
const deadline = Date.now() + 900000;
// Logged in = Instagram's sessionid cookie exists. Then (re)open the post.
while (Date.now() < deadline) {
    if ((await ctx.cookies('https://www.instagram.com')).some((c) => c.name === 'sessionid')) break;
    await p.waitForTimeout(3000);
}
if (!(await ctx.cookies('https://www.instagram.com')).some((c) => c.name === 'sessionid')) { console.log('NOT LOGGED IN, gave up'); process.exit(1); }
console.log('logged in');
await p.goto(url); await p.waitForTimeout(6000);
for (let i = 1; i <= 20; i++) {
    await p.screenshot({ path: resolve(out, `ref-${i}.png`) });
    const next = p.locator('button[aria-label="Next"]').first();
    if (!(await next.count()) || !(await next.isVisible().catch(() => false))) { console.log(`captured ${i} slides`); break; }
    await next.click(); await p.waitForTimeout(1500);
}
const cap = await p.locator('h1').first().innerText().catch(() => '');
console.log('CAPTION:', cap.slice(0, 1500));
await ctx.close();
