// Render a Cloud Bank carousel to PNG slides (1080x1350) + a contact sheet.
//
// Usage (from the repo root so `playwright` resolves):
//   node scripts/carousel/render.mjs <workdir>
//
// <workdir> must contain build.js (uses CloudBank helpers and assigns
// document.getElementById('slides').innerHTML) plus the art it references.
// This script assembles page.html = head.html + cloud-bank.js + build.js,
// copies the logo in, renders every <section class="slide"> to
// f-slide-N.png, writes f-slide-N.jpg (quality 94, the posted files) and
// sheet.png (all slides tiled) for review.
import { chromium } from 'playwright';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, copyFileSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const tplDir = resolve(here, '../../docs/carousel-templates');
const dir = resolve(process.argv[2] || '.');

const head = readFileSync(resolve(tplDir, 'head.html'), 'utf8');
const tpl = readFileSync(resolve(tplDir, 'cloud-bank.js'), 'utf8');
const build = readFileSync(resolve(dir, 'build.js'), 'utf8');
writeFileSync(resolve(dir, 'page.html'), `${head}<div id="slides"></div>\n<script>\n${tpl}\n${build}\n</script></body></html>`);
copyFileSync(resolve(tplDir, 'logo-trim.png'), resolve(dir, 'logo-trim.png'));
for (const f of readdirSync(dir)) if (/^f-slide-\d+\.(png|jpg)$/.test(f)) unlinkSync(resolve(dir, f));

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('requestfailed', (r) => errors.push('missing asset: ' + r.url()));
await p.goto(pathToFileURL(resolve(dir, 'page.html')).href, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(800);
const n = await p.locator('section.slide').count();
if (n < 5 || n > 8) errors.push(`slide count ${n} is outside the 5-8 rule`);
for (let i = 0; i < n; i++) {
    const png = resolve(dir, `f-slide-${i + 1}.png`);
    await p.locator('section.slide').nth(i).screenshot({ path: png });
    const jp = await b.newPage({ viewport: { width: 1080, height: 1350 } });
    await jp.goto(pathToFileURL(png).href);
    await jp.screenshot({ path: resolve(dir, `f-slide-${i + 1}.jpg`), type: 'jpeg', quality: 94 });
    await jp.close();
}
// Contact sheet: all slides at 1/3 scale in one row-wrapped image.
const cols = Math.min(4, n);
await p.setViewportSize({ width: cols * 360, height: Math.ceil(n / cols) * 450 });
await p.setContent(`<body style="margin:0;display:flex;flex-wrap:wrap;background:#111">${Array.from({ length: n }, (_, i) =>
    `<img src="${pathToFileURL(resolve(dir, `f-slide-${i + 1}.png`)).href}" style="width:360px;height:450px">`).join('')}</body>`);
await p.waitForTimeout(500);
await p.screenshot({ path: resolve(dir, 'sheet.png') });
await b.close();

console.log(`rendered ${n} slides -> ${dir}`);
if (errors.length) { console.error('PROBLEMS:\n- ' + errors.join('\n- ')); process.exitCode = 1; }
