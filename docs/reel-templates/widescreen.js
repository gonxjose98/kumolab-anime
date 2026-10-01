// KumoLab REEL template: WIDESCREEN clips (16:9 clip that doesn't fill 9:16). LOCKED 2026-09-30.
// Two themes, both approved by Jose: 'day' (carousel sky) and 'night' (navy + stars, dimmed clouds).
// The clip is composited separately (scaled to 1080x608 at y=616); this layer is the full-frame
// overlay PNG with a transparent window where the clip plays.
//
// Rules (from Jose's feedback):
//  - clouds never cover the video: top clouds are upright and REST on the video's top edge
//    (never flipped), bottom clouds overlap at most ~28px (subtitles stay visible).
//  - night clouds are dimmed ~20% as ONE unit with the carousel bank() mist so they dissolve
//    into the sky (no separate colored box under them).
//  - title: gold "KUMO PICKS" label + 2-line Cormorant headline with one gold italic word.
//  - no em dashes.
//
// Usage: build.js sets window.REEL = { theme, line1, line2Html, show, showSub } then calls
// Reel.widescreen(). Render with render-layers.mjs (outputs L-overlay.png).
const Reel = (() => {
    const { NAVY, AMBER, AMBER2, GOLD, cloud, bank } = CloudBank;
    const PY = 616, PH = 608, PB = PY + PH;
    const perch = (edge, items = [[-80, 300], [170, 250], [400, 300], [660, 260], [880, 300]]) =>
        items.map(([x, w], i) => cloud(x, edge - Math.round(w * 150 / 400), w, 1, i % 2 === 1, 4)).join('');
    const row = (y, ws = [360, 320, 360, 330, 360]) => [[-100, y, ws[0]], [160, y + 18, ws[1]], [400, y - 4, ws[2]], [650, y + 14, ws[3]], [860, y, ws[4]]]
        .map(([x, yy, w], i) => cloud(x, yy, w, 1, i % 2 === 1, 4)).join('');
    const stars = (top, bot, n = 40) => { let s = '', r = 7; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
        for (let i = 0; i < n; i++) { const z = 2 + rnd() * 3, y = top + rnd() * (bot - top); s += `<i style="position:absolute;left:${rnd() * 1070}px;top:${y}px;width:${z}px;height:${z}px;border-radius:50%;background:#fff;opacity:${.3 + rnd() * .6};z-index:2"></i>`; } return s; };
    const logo = (day) => `<img src="logo-trim.png" style="position:absolute;top:132px;left:50%;transform:translateX(-50%);height:64px;z-index:9;${day ? 'filter:brightness(0) saturate(100%) invert(12%) sepia(55%) saturate(2400%) hue-rotate(205deg)' : 'filter:brightness(0) invert(1)'}">`;
    const plain = (h) => h.replace(/<[^>]+>/g, '');
    // Auto-fit: long headlines shrink (max 112px, min 72px) so each stays ONE line inside the 960px column.
    const fitTitle = (R) => Math.max(72, Math.min(112, Math.floor(960 / (0.45 * Math.max(plain(R.line1).length, plain(R.line2Html).length)))));
    // Show line: one row if it fits, otherwise the detail drops under the name.
    const showFits = (R) => 0.47 * 84 * R.show.length + 0.72 * 29 * (R.showSub || '').length + 16 <= 980;
    const title = (R, color, accent) => `<div class="kl-text" style="position:absolute;left:60px;right:60px;top:${PY - 400}px;text-align:center;z-index:6;color:${color}">
      <div style="display:flex;justify-content:center;align-items:center;gap:14px">
        <span style="font-size:34px;color:${accent}">&#9733;</span>
        <span style="font-size:31px;font-weight:800;letter-spacing:.2em;color:${accent}">${R.label || 'KUMO PICKS'}</span></div>
      <div class="serif" style="margin-top:10px;font-size:${fitTitle(R)}px;font-weight:700;line-height:.95;white-space:nowrap">${R.line1}<br>${R.line2Html.replace(/<i>/g, `<i style="color:${accent}">`)}</div></div>`;
    const show = (R, y, acc) => `<div class="kl-text" style="position:absolute;left:0;right:0;top:${showFits(R) ? y : y - 30}px;z-index:7;display:flex;${showFits(R) ? 'justify-content:center;align-items:baseline;gap:16px' : 'flex-direction:column;align-items:center;gap:4px'};color:${NAVY}">
        <span class="serif" style="font-size:84px;font-weight:700;color:${acc};line-height:1">${R.show}</span>
        <span style="font-size:29px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">${R.showSub || ''}</span></div>`;
    const hole = `<div style="position:absolute;left:0;top:${PY}px;width:1080px;height:${PH}px;background:transparent"></div>`;
    function widescreen() {
        const R = window.REEL, day = R.theme === 'day';
        const inner = day
            ? `${logo(true)}${title(R, NAVY, AMBER2)}${hole}${perch(PY)}${row(PB - 24)}${show(R, PB + 120, AMBER)}`
            : `<style>#overlay > svg.cloud{filter:brightness(.8) saturate(1.25) hue-rotate(-6deg) drop-shadow(0 18px 24px rgba(15,50,120,.18)) !important}#overlay .nightbank{filter:brightness(.8) saturate(1.25) hue-rotate(-6deg)}</style>
               ${stars(80, PY - 20)}${stars(PB + 180, 1900, 30)}${logo(false)}${title(R, '#fff', GOLD)}${hole}${perch(PY)}
               <div class="nightbank" style="position:absolute;inset:0;z-index:4">${bank(PB - 24)}</div>${show(R, PB + 150, AMBER)}`;
        const bg = day ? 'linear-gradient(180deg,#9FD2FF 0%,#EEF5FE 45%,#EEF5FE 60%,#D3E6FB 100%)' : 'linear-gradient(180deg,#07122B 0%,#0B2A5B 55%,#07122B 100%)';
        // The background is painted everywhere EXCEPT the clip window, so the PNG has a transparent hole.
        const mask = `-webkit-mask:linear-gradient(#000 0 0) top/100% ${PY}px no-repeat,linear-gradient(#000 0 0) bottom/100% ${1920 - PB}px no-repeat`;
        const part = R.part === 'art' ? '<style>#overlay .kl-text{visibility:hidden}</style>'
            : R.part === 'text' ? '<style>#overlay > :not(.kl-text):not(style){visibility:hidden}#overlay .kl-text *{visibility:visible}</style>' : '';
        return `<section class="layer" id="overlay">${part}<div style="position:absolute;inset:0;background:${bg};${mask}"></div>${inner}</section>`;
    }
    return { widescreen, PY, PH };
})();
