// List the posts saved on an Instagram account (newest save first).
//
// Usage (repo root): node scripts/carousel/ig_saved.mjs <username> <outdir>
// Uses the same persistent login as ig_grab.mjs (%TEMP%/kl-ig-profile).
// Writes <outdir>/saved.json [postUrl, ...] and saved-N.png grid screenshots.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const [user, outArg] = process.argv.slice(2);
const out = resolve(outArg); mkdirSync(out, { recursive: true });
const ctx = await chromium.launchPersistentContext(join(tmpdir(), 'kl-ig-profile'), { headless: false, viewport: { width: 1200, height: 1100 } });
const p = ctx.pages()[0] || await ctx.newPage();
await p.goto(`https://www.instagram.com/${user}/saved/all-posts/`);
await p.waitForTimeout(6000);
const links = [];
for (let i = 1; i <= 12; i++) {
    for (const h of await p.$$eval('a[href*="/p/"], a[href*="/reel/"]', (as) => as.map((a) => a.href))) {
        const u = h.split('?')[0]; if (!links.includes(u)) links.push(u);
    }
    await p.screenshot({ path: resolve(out, `saved-${i}.png`) });
    const before = links.length;
    await p.mouse.wheel(0, 900); await p.waitForTimeout(2500);
    if (i > 2 && links.length === before && (await p.evaluate(() => innerHeight + scrollY >= document.body.scrollHeight - 5))) break;
}
writeFileSync(resolve(out, 'saved.json'), JSON.stringify(links, null, 1));
console.log(links.length, 'saved posts'); links.forEach((l) => console.log(l));
await ctx.close();
