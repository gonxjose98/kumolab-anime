// Screenshot the first slide + caption of many Instagram posts (quick triage).
//
// Usage (repo root): node scripts/carousel/ig_covers.mjs <urls.json> <outdir>
// Uses the persistent login from ig_grab.mjs. Writes cover-N.png + covers.json.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const urls = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = resolve(process.argv[3]); mkdirSync(out, { recursive: true });
const ctx = await chromium.launchPersistentContext(process.env.KL_IG_PROFILE || join(tmpdir(), 'kl-ig-profile'), { headless: false, viewport: { width: 1200, height: 1000 } });
const res = [];
for (const [i, url] of urls.entries()) {
    // Fresh tab per post: a heavy reel can crash a tab, which must not stop the run.
    const p = await ctx.newPage();
    try {
        await p.goto(url); await p.waitForTimeout(5000);
        await p.screenshot({ path: resolve(out, `cover-${i + 1}.png`) });
        const caption = await p.locator('h1').first().innerText().catch(() => '');
        res.push({ n: i + 1, url, caption: caption.slice(0, 300) });
        console.log(i + 1, '|', caption.replace(/\s+/g, ' ').slice(0, 120));
    } catch (e) { console.log(i + 1, 'FAILED', e.message.slice(0, 80)); }
    await p.close().catch(() => {});
}
writeFileSync(resolve(out, 'covers.json'), JSON.stringify(res, null, 1));
await ctx.close();
