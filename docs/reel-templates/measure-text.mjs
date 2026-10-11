import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto(pathToFileURL(process.argv[2]).href); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
const r = await p.evaluate(() => {
  const out = []; const walk = (el) => { for (const n of el.childNodes) { if (n.nodeType === 3 && n.textContent.trim()) { const rg = document.createRange(); rg.selectNodeContents(n); for (const rc of rg.getClientRects()) { const cs = getComputedStyle(n.parentElement); out.push({ text: n.textContent.trim(), x: Math.round(rc.left), y: Math.round(rc.top), w: Math.round(rc.width), h: Math.round(rc.height), baseline: null, font: cs.fontFamily.split(',')[0].replace(/"/g, ''), size: cs.fontSize, weight: cs.fontWeight, style: cs.fontStyle, color: cs.color, letterSpacing: cs.letterSpacing, transform: cs.textTransform }); } } else if (n.nodeType === 1) walk(n); } };
  document.querySelectorAll('.kl-text').forEach(walk); return out; });
console.log(JSON.stringify(r, null, 1)); await b.close();
