// LOCKED reel overlay "Rising Clouds" (Jose, 2026-09-29): no box. Big white Cormorant headline on the video,
// gold "0N · ANIME NEWS" label (a dot, never a dash-like line), a short cloud bank rising from the bottom holding the amber date.
const { NAVY, AMBER, AMBER2, GOLD, cloud, header, strip, bank } = CloudBank;
const L = (id, inner, bg = 'transparent') => `<section class="layer" id="${id}" style="background:${bg}">${inner}</section>`;
const logo = `<img src="logo-trim.png" style="position:absolute;top:150px;left:72px;height:96px;z-index:9;filter:brightness(0) invert(1) drop-shadow(0 2px 10px rgba(6,24,70,.5))">`;

// Persistent: top shade + logo, bottom shade, the rising cloud bank and its pale fade.
const frame = L('frame', `
  <div style="position:absolute;left:0;right:0;top:0;height:380px;background:linear-gradient(180deg,rgba(8,28,80,.5),rgba(8,28,80,0))"></div>${logo}
  <div style="position:absolute;left:0;right:0;bottom:0;height:900px;background:linear-gradient(180deg,rgba(8,28,80,0) 0%,rgba(8,28,80,.55) 55%,rgba(8,28,80,.7) 100%)"></div>
  ${[[-120, 1455, 380], [150, 1480, 330], [390, 1450, 380], [640, 1475, 340], [860, 1455, 360]].map(([x, y, w], i) => cloud(x, y, w, 1, i % 2 === 1, 7)).join('')}
  <div style="position:absolute;left:0;right:0;top:1560px;height:360px;background:linear-gradient(180deg,rgba(238,245,254,1) 0%,rgba(238,245,254,.85) 35%,rgba(238,245,254,0) 100%);z-index:6"></div>`);

// Per item: label + two-line headline (one gold italic accent) + amber date on the clouds.
const item = (n, l1, l2, date, label) => L('item' + n, `
  <div style="position:absolute;left:72px;right:72px;top:1150px;z-index:6;color:#fff">
    <div style="display:flex;align-items:center;gap:18px;text-shadow:0 2px 14px rgba(6,24,70,.85),0 0 4px rgba(6,24,70,.6)">
      <span class="serif" style="font-size:64px;font-weight:700;color:${GOLD};line-height:1">${String(n).padStart(2, '0')}</span>
      <span style="width:10px;height:10px;border-radius:50%;background:${GOLD};box-shadow:0 1px 6px rgba(6,24,70,.7)"></span>
      <span style="font-size:24px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:${GOLD}">Anime news</span></div>
    <div class="serif" style="margin-top:14px;font-size:104px;font-weight:700;line-height:.98;text-shadow:0 4px 30px rgba(6,24,70,.7)">${l1}<br>${l2}</div>
  </div>
  <div style="position:absolute;left:72px;right:72px;top:1524px;z-index:8;display:flex;align-items:baseline;gap:18px;color:${NAVY}">
    <span class="serif" style="font-size:72px;font-weight:700;color:${AMBER};line-height:1">${date}</span>
    <span style="font-size:22px;font-weight:800;letter-spacing:.14em;text-transform:uppercase">${label}</span></div>`);
const G = (s) => `<i style="color:${GOLD}">${s}</i>`;
const items = [
  item(1, 'New Naruto', G('anime'), 'Oct 10', 'Full reveal at NYCC'),
  item(2, 'Dragon Ball', 'Super: ' + G('Beerus'), 'Oct 11', 'Premiere · One Piece back 2027'),
  item(3, 'New Code', 'Geass ' + G('series'), '2027', 'Star Chaser Aspal'),
  item(4, 'Slime S4,', G('Part 3'), 'Jul 2027', 'Clayman spinoff in April'),
  item(5, 'Apothecary', 'Diaries ' + G('S3'), 'Oct 2', 'Starts this Friday'),
].join('');

// End card stays the share-slide look (it's the one moment the whole screen is ours).
const BG = 'linear-gradient(180deg,#9FD2FF 0%,#EEF5FE 62%,#D3E6FB 100%)';
const end = L('end', `${strip([['img/poster-naruto.jpg', '50%', '20%'], ['img/poster-geass.jpg', '35%', '15%'], ['img/poster-slime.jpg', '50%', '45%'], ['img/poster-apoth.jpg', '80%', '60%']], 1010)}
  ${bank(870)}${header('Save + share')}
  <div style="position:absolute;top:1130px;left:70px;right:70px;text-align:center;z-index:4;color:${NAVY}">
    <div class="serif" style="font-size:92px;font-weight:700;line-height:1.02">That's the news.</div>
    <div class="serif" style="font-size:58px;font-weight:600;font-style:italic;margin-top:18px;color:${AMBER2}">Which one hyped you most?</div>
    <div style="margin-top:40px"><span class="btn" style="font-size:26px;padding:26px 48px">Follow @kumolabanime</span></div></div>`, BG);

document.getElementById('slides').innerHTML = frame + items + end;
