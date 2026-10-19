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
    // TikTok is @kumolab.anime; call CloudBank.setHandle('@kumolab.anime') before building a TikTok-only carousel.
    let HANDLE = '@kumolabanime';
    const setHandle = (h) => { HANDLE = h; };

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
    const cover = ({ id = 's0', label, strip: items, hook, total, sticker: st }) => `<section class="slide" id="${id}" style="${BG}">${strip(items, 900)}${bank(760)}${header(label)}${sticker(st, 690)}
      <div style="position:absolute;top:985px;left:50px;right:50px;text-align:center;z-index:4;color:${NAVY}">
        <div class="jp" style="font-size:22px;opacity:.8">${hook.jp}</div>
        <div class="serif" style="font-size:88px;font-weight:700;line-height:1;margin-top:6px">${hook.line1}</div>
        <div class="serif" style="font-size:80px;font-weight:600;line-height:1.08">${hook.line2Html}</div>
        <div style="margin-top:12px;font-size:21px;font-weight:700;letter-spacing:.04em;opacity:.8">${hook.sub}</div></div>
      ${foot(0, total, 'Swipe &nbsp;→')}</section>`;

    // List slide (Jose, 2026-10-19): same reading size as story slides, so every post reads alike.
    // Title, one row of pills (meta, stats, where to watch), a kicker, one sentence (~110 chars max).
    const pill = (html, bg, ink) => `<span style="display:inline-flex;align-items:baseline;gap:8px;background:${bg};color:${ink};border-radius:999px;padding:8px 20px;font-size:26px;font-weight:800;white-space:nowrap">${html}</span>`;
    const content = ({ id, n, total, label, img, rankNo, title, meta, stats = [], watch, kicker, line, sticker: st }) => `<section class="slide" id="${id}" style="${BG}">${hero(img, 790)}${bank(650)}${header(label)}${sticker(st, 600)}
      ${rankNo != null ? rank(rankNo).replace('top:540px', 'top:500px') : ''}
      <div style="position:absolute;left:60px;right:60px;top:820px;z-index:4;color:${NAVY}">
        <div class="serif" style="font-size:${title.length > 26 ? 66 : title.length > 18 ? 76 : 86}px;font-weight:700;line-height:1">${title}</div>
        <div style="margin-top:18px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">
          ${meta ? pill(meta, '#FFFFFFB3', NAVY) : ''}
          ${stats.map(([v, l]) => pill(`${v}<span style="font-size:19px;font-weight:700;opacity:.85">${l}</span>`, GOLD, NAVY)).join('')}
          ${watch ? pill(`&#9654; ${watch}`, NAVY, '#fff') : ''}</div>
        ${kicker ? `<div style="margin-top:22px;font-size:34px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:${ACCENT}">${kicker}</div>` : ''}
        <div style="margin-top:${kicker ? 8 : 20}px;font-size:40px;line-height:1.28;font-weight:600">${pop(line)}</div></div>
      ${foot(n, total, HANDLE)}</section>`;

    // Pop (Jose, 2026-10-16): "all one color, one font" loses low-attention viewers.
    // Inline markup for story text: [word] = accent color, italic, brush underline;
    // {phrase} = gold highlighter. One or two marks per slide, never the whole line.
    let ACCENT = '#E0344F';
    const setAccent = (c) => { ACCENT = c; };
    const plain = (s) => s.replace(/[[\]{}]/g, '');
    const pop = (s) => s
        .replace(/\[([^\]]+)\]/g, (_, w) => `<span style="color:${ACCENT};font-style:italic;background:linear-gradient(transparent 82%,${ACCENT}55 82%,${ACCENT}55 96%,transparent 96%);padding:0 .06em">${w}</span>`)
        .replace(/\{([^}]+)\}/g, (_, w) => `<span style="font-weight:800;background:linear-gradient(transparent 50%,${GOLD} 50%,${GOLD} 94%,transparent 94%);padding:0 .1em;box-decoration-break:clone;-webkit-box-decoration-break:clone">${w}</span>`);
    // Tilted sticker slapped on the art edge: {text, icon?, color?, ink?, side?: 'left'|'right'}.
    // icon (an emoji) sits in a white bubble so it reads on any sticker color.
    const sticker = (s, top = 600) => {
        if (!s) return '';
        const c = s.color || ACCENT, right = s.side !== 'left';
        return `<div style="position:absolute;top:${top}px;${right ? 'right:54px' : 'left:54px'};z-index:6;transform:rotate(${right ? 4 : -4}deg);background:${c};color:${s.ink || '#fff'};font-family:Manrope,sans-serif;font-weight:800;font-size:30px;letter-spacing:.06em;text-transform:uppercase;padding:12px 26px 12px ${s.icon ? 12 : 26}px;border-radius:14px;border:4px solid #fff;box-shadow:0 10px 26px rgba(6,24,70,.35);display:flex;align-items:center;gap:14px">${s.icon ? `<span style="width:52px;height:52px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;font-size:30px">${s.icon}</span>` : ''}${s.text}</div>`;
    };

    // Story slide (Jose, 2026-10-16): ONE big headline + ONE sentence, nothing else.
    // The text carries the story, so it is big; art is a little shorter to make room.
    // Use for trend/story posts; `content` (stats, watch-on) stays for list posts.
    // Add color with pop() markup and an optional sticker; see README "Pop".
    const story = ({ id, n, total, label, img, title, line, sticker: st }) => `<section class="slide" id="${id}" style="${BG}">${hero(img, 790)}${bank(650)}${header(label)}${sticker(st)}
      <div style="position:absolute;left:60px;right:60px;top:830px;z-index:4;color:${NAVY}">
        <div class="serif" style="font-size:${plain(title).length > 24 ? 80 : 96}px;font-weight:700;line-height:1.02">${pop(title)}</div>
        <div style="margin-top:28px;font-size:48px;line-height:1.3;font-weight:600">${pop(line)}</div></div>
      ${foot(n, total, HANDLE)}</section>`;

    // Share slide, always last.
    const share = ({ id, n, total, strip: items, question, prompt, footRight = 'Save for later', sticker: st }) => `<section class="slide" id="${id}" style="${BG}">${strip(items, 640)}${bank(500)}${header('Save + share')}${sticker(st, 440)}
      <div style="position:absolute;top:780px;left:70px;right:70px;text-align:center;z-index:4;color:${NAVY}">
        <div class="serif" style="font-size:80px;font-weight:700;line-height:1.04">${pop(question)}</div>
        <div class="serif" style="font-size:54px;font-weight:600;font-style:italic;margin-top:18px;color:${AMBER2}">${prompt}</div>
        <div style="margin-top:34px"><span class="btn" style="font-size:24px;padding:24px 44px">Follow ${HANDLE}</span></div></div>
      ${foot(n, total, footRight)}</section>`;

    return { setHandle, setAccent, pop, sticker, BG, NAVY, AMBER, AMBER2, GOLD, cloud, header, bank, dots, foot, hero, strip, rank, cover, content, story, share };
})();

if (typeof module !== 'undefined') module.exports = CloudBank;
