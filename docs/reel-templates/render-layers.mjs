// Render layers.js into transparent 1080x1920 PNGs (run from the workspace-kumolab repo root).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = resolve(process.argv[2]);
const tpl = resolve('docs/carousel-templates');
const head = readFileSync(resolve(tpl, 'head.html'), 'utf8')
  // transparent page; header sits below Instagram's top UI; layers are reel-sized
  .replace('body{background:#111;', 'body{background:transparent;')
  .replace('</style>', '.layer{width:1080px;height:1920px;position:relative;overflow:hidden;margin:0;color:#fff}.top{top:150px!important}</style>');
writeFileSync(resolve(dir, 'layers.html'), `${head}<div id="slides"></div><script>${readFileSync(resolve(tpl, 'cloud-bank.js'), 'utf8')}\n${readFileSync(resolve(dir, 'layers.js'), 'utf8')}</script></body></html>`);
copyFileSync(resolve(tpl, 'logo-trim.png'), resolve(dir, 'logo-trim.png'));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
p.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
p.on('requestfailed', (r) => console.error('MISSING', r.url()));
await p.goto(pathToFileURL(resolve(dir, 'layers.html')).href, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(600);
for (const id of await p.$$eval('section.layer', (s) => s.map((x) => x.id))) {
  await p.locator('#' + id).screenshot({ path: resolve(dir, `L-${id}.png`), omitBackground: true });
  console.log('layer', id);
}
await b.close();
