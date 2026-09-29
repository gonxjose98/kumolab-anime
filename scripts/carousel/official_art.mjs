// Collect official key-visual / poster candidates from official anime sites.
//
// Usage (repo root): node scripts/carousel/official_art.mjs <outdir> '<json {key: siteUrl}>'
// Get official site URLs from AniList externalLinks (type INFO).
// Downloads every image >= 700px on its short side into <outdir>/kv/,
// then writes <outdir>/kv-sheet.png: the 6 largest unique images per key,
// labelled, for picking by eye. Also writes kv-index.json {key: [files]}.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const out = resolve(process.argv[2]);
const sites = JSON.parse(process.argv[3]);
mkdirSync(resolve(out, 'kv'), { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' });
const index = {};
for (const [key, url] of Object.entries(sites)) {
    const p = await ctx.newPage();
    const seen = new Set();
    p.on('response', (r) => { const ct = r.headers()['content-type'] || ''; if (ct.startsWith('image/') && !/svg|gif/.test(ct)) seen.add(r.url()); });
    try {
        await p.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await p.waitForTimeout(3000);
        await p.evaluate(async () => { for (let y = 0; y < 6000; y += 800) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 250)); } });
        await p.waitForTimeout(1500);
        const dom = await p.evaluate(() => {
            const u = new Set();
            document.querySelectorAll('img').forEach((i) => { if (i.currentSrc || i.src) u.add(i.currentSrc || i.src); });
            document.querySelectorAll('meta[property="og:image"]').forEach((m) => m.content && u.add(new URL(m.content, location.href).href));
            document.querySelectorAll('*').forEach((e) => { const m = getComputedStyle(e).backgroundImage.match(/url\("?(.*?)"?\)/); if (m && !m[1].startsWith('data:')) u.add(new URL(m[1], location.href).href); });
            return [...u];
        });
        dom.forEach((x) => seen.add(x));
    } catch (e) { console.error(key, 'page error:', e.message); }
    const got = [];
    for (const u of seen) {
        try {
            const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: url } });
            const buf = Buffer.from(await r.arrayBuffer());
            const img = await p.evaluate(async (b64) => {
                const im = new Image(); im.src = 'data:image;base64,' + b64; await im.decode().catch(() => {});
                return { w: im.naturalWidth, h: im.naturalHeight };
            }, buf.toString('base64'));
            if (Math.min(img.w, img.h) < 700) continue;
            const fn = resolve(out, 'kv', `${key}-${createHash('md5').update(u).digest('hex').slice(0, 8)}.jpg`);
            writeFileSync(fn, buf);
            got.push({ fn, w: img.w, h: img.h, area: img.w * img.h });
        } catch { /* skip */ }
    }
    const uniq = []; const sizes = new Set();
    for (const g of got.sort((a, b) => b.area - a.area)) { const k = `${g.w}x${g.h}`; if (!sizes.has(k)) { sizes.add(k); uniq.push(g); } }
    index[key] = uniq.slice(0, 6);
    console.log(key, index[key].map((g) => `${g.w}x${g.h}`).join(', ') || 'NOTHING FOUND');
    await p.close();
}
writeFileSync(resolve(out, 'kv-index.json'), JSON.stringify(index, null, 1));
const page = await ctx.newPage();
const rows = Object.entries(index).map(([k, arr]) => `<div style="display:flex;gap:8px;margin-bottom:8px;align-items:flex-start"><div style="width:90px;color:#ff0;font:bold 14px sans-serif">${k}</div>${arr.map((g, i) =>
    `<div style="position:relative"><img src="${pathToFileURL(g.fn).href}" style="height:240px"><span style="position:absolute;left:0;top:0;background:#000;color:#ff0;font:12px sans-serif;padding:2px">${i} ${g.w}x${g.h}</span></div>`).join('')}</div>`).join('');
await page.setViewportSize({ width: 1800, height: 900 });
await page.setContent(`<body style="background:#222;margin:8px">${rows}</body>`);
await page.waitForTimeout(800);
await page.screenshot({ path: resolve(out, 'kv-sheet.png'), fullPage: true });
await b.close();
console.log('sheet:', resolve(out, 'kv-sheet.png'));
