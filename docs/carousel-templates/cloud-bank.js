// Cloud Bank: the LOCKED KumoLab carousel template (Jose, 2026-09-28).
// Every carousel is built from these helpers. Do not restyle; see README.md.
//
// Usage: a page with the <head> of cloud-bank-sample-frieren.html (fonts, base
// CSS, the #cloud SVG symbol), `logo-trim.png` beside it, then:
//   const {slide, cover, content, share} = CloudBank;  build slides, then
//   document.getElementById('slides').innerHTML = html;
// Render each <section class="slide"> at 1080x1350.

const CloudBank = (() => {
    const BG = 'background:linear-gradient(180deg,#9FD2FF 0%,#EEF5FE 62%,#D3E6FB 100%)';
    const NAVY = '#0B2A5B', AMBER = '#D98E12', AMBER2 = '#E09A1E', GOLD = '#FFD27A';

    const cloud = (x, y, w, o = 1, flip = false, z = 1) =>
        `<svg class="cloud" style="left:${x}px;top:${y}px;width:${w}px;opacity:${o};z-index:${z};${flip ? 'transform:scaleX(-1)' : ''}"><use href="#cloud"/></svg>`;

    // The real logo, white, top-left; pill label top-right.
    const header = (label) => `<div class="top"><img src="logo-trim.png" alt="KumoLab" style="height:112px;width:auto;display:block;filter:brightness(0) invert(1) drop-shadow(0 2px 10px rgba(6,24,70,.45))"><div class="pill">${label}</div></div>`;

    // The cloud bank: a row of illustrated clouds fading into pale sky.
    const bank = (y) => {
        let s = '';
        [-160, 70, 300, 520, 740, 950].forEach((x, i) => { s += cloud(x, y + (i % 2 ? 30 : 0), 400, 1, i % 2 === 1, 3); });
        return s + `<div style="position:absolute;left:0;right:0;top:${y + 125}px;height:330px;background:linear-gradient(180deg,#F4F9FF 0%,#E4EFFC 45%,rgba(228,239,252,0) 100%);z-index:2"></div>`;
    };

    const dots = (n, total) => `<div class="dots">${Array.from({ length: total }, (_, i) => `<i class="${i === n ? 'on' : ''}" style="${i !== n ? 'background:#0B2A5B33' : ''}"></i>`).join('')}</div>`;
    const foot = (n, total, right) => `<div class="foot" style="bottom:36px;color:${NAVY}">${dots(n, total)}<span style="font-size:18px">${right}</span></div>`;

    // Full-width hero art (1080x820 source) for content slides.
    const hero = (src, hgt = 820) => `<div style="position:absolute;left:0;right:0;top:0;height:${hgt}px;z-index:1"><img src="${src}" style="width:100%;height:100%;object-fit:cover;object-position:50% 40%">
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,28,80,.5) 0%,rgba(8,28,80,0) 20%)"></div></div>`;

    // Vertical poster strip for covers/share slides: items = [[src, xPos, yPos, flex?], ...]. Use 4.
    const strip = (items, hgt) => `<div style="position:absolute;left:0;right:0;top:0;height:${hgt}px;z-index:1;display:flex">${items.map(([s, x = '50%', y = '30%', f = 1]) => `<img src="${s}" style="flex:${f};min-width:0;height:100%;object-fit:cover;object-position:${x} ${y}">`).join('')}
      <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,28,80,.5) 0%,rgba(8,28,80,0) 25%)"></div></div>`;

    const rank = (n) => `<div class="serif" style="position:absolute;left:66px;top:540px;font-size:150px;font-weight:700;line-height:1;z-index:5;color:${GOLD};-webkit-text-stroke:2.5px rgba(11,42,91,.55);text-shadow:0 4px 0 rgba(11,42,91,.35),0 8px 30px rgba(6,24,70,.7)">${String(n).padStart(2, '0')}</div>`;

    // Cover: strip + hook. hook = {jp, line1, line2Html, sub}.
    const cover = ({ id = 's0', label, strip: items, hook, total }) => `<section class="slide" id="${id}" style="${BG}">${strip(items, 900)}${bank(760)}${header(label)}
      <div style="position:absolute;top:985px;left:50px;right:50px;text-align:center;z-index:4;color:${NAVY}">
        <div class="jp" style="font-size:22px;opacity:.8">${hook.jp}</div>
        <div class="serif" style="font-size:88px;font-weight:700;line-height:1;margin-top:6px">${hook.line1}</div>
        <div class="serif" style="font-size:80px;font-weight:600;line-height:1.08">${hook.line2Html}</div>
        <div style="margin-top:12px;font-size:21px;font-weight:700;letter-spacing:.04em;opacity:.8">${hook.sub}</div></div>
      ${foot(0, total, 'Swipe &nbsp;→')}</section>`;

    // Content slide. stats = [[value, label], ...]; watch optional.
    const content = ({ id, n, total, label, img, rankNo, title, meta, stats = [], watch, line }) => `<section class="slide" id="${id}" style="${BG}">${hero(img)}${bank(680)}${header(label)}
      ${rankNo != null ? rank(rankNo) : ''}
      <div style="position:absolute;left:72px;right:72px;top:900px;z-index:4;color:${NAVY}">
        <div class="serif" style="font-size:${title.length > 30 ? 54 : title.length > 20 ? 66 : 78}px;font-weight:700;line-height:1">${title}</div>
        <div style="margin-top:12px;font-size:22px;font-weight:700;letter-spacing:.06em;opacity:.9">${meta}</div>
        <div style="margin-top:22px;display:flex;gap:44px;align-items:flex-end">
          ${stats.map(([v, l]) => `<div><div class="serif" style="color:${AMBER};font-size:58px;font-weight:700;line-height:1">${v}</div><div style="margin-top:6px;font-size:15px;font-weight:800;letter-spacing:.14em;text-transform:uppercase">${l}</div></div>`).join('')}
          ${watch ? `<div style="margin-left:auto;text-align:right"><div style="font-size:15px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;opacity:.85">Watch on</div><div style="color:${AMBER};margin-top:6px;font-size:26px;font-weight:800">${watch}</div></div>` : ''}</div>
        <div style="margin-top:20px;font-size:25px;line-height:1.42;font-weight:600">${line}</div></div>
      ${foot(n, total, '@kumolabanime')}</section>`;

    // Share slide, always last.
    const share = ({ id, n, total, strip: items, question, prompt, footRight = 'Save for later' }) => `<section class="slide" id="${id}" style="${BG}">${strip(items, 640)}${bank(500)}${header('Save + share')}
      <div style="position:absolute;top:780px;left:70px;right:70px;text-align:center;z-index:4;color:${NAVY}">
        <div class="serif" style="font-size:80px;font-weight:700;line-height:1.04">${question}</div>
        <div class="serif" style="font-size:54px;font-weight:600;font-style:italic;margin-top:18px;color:${AMBER2}">${prompt}</div>
        <div style="margin-top:34px"><span class="btn" style="font-size:24px;padding:24px 44px">Follow @kumolabanime</span></div></div>
      ${foot(n, total, footRight)}</section>`;

    return { BG, NAVY, AMBER, AMBER2, GOLD, cloud, header, bank, dots, foot, hero, strip, rank, cover, content, share };
})();

if (typeof module !== 'undefined') module.exports = CloudBank;
