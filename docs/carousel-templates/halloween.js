// Halloween skin for Cloud Bank carousels. LOCKED choice (Jose, 2026-09-29): 'lantern'
// (Lantern Night: pitch black, charcoal fog glowing orange from below, jack-o'-lanterns, embers, vines).
// Layout is untouched; only palette, clouds and decorations change. render.mjs always loads this file;
// a Halloween carousel just ends build.js with:  Halloween.apply('lantern');
// Other themes here were rejected alternatives (moon, pumpkin, ghost, nightmoon, eyes): do not use.
const Halloween = (() => {
    const NS = 'http://www.w3.org/2000/svg';

    // ---------- shared art (inline SVG strings) ----------
    const bat = (x, y, w, rot = 0, fill = '#0A0612', o = 1) =>
        `<svg viewBox="0 0 100 44" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;transform:rotate(${rot}deg);opacity:${o};z-index:4;overflow:visible">
          <path fill="${fill}" d="M50 14 L47 6 L45 13 C40 9 33 9 29 14 C24 6 13 3 2 8 C10 11 14 17 13 25 C19 20 26 21 29 29 C34 23 41 24 46 32 L50 38 L54 32 C59 24 66 23 71 29 C74 21 81 20 87 25 C86 17 90 11 98 8 C87 3 76 6 71 14 C67 9 60 9 55 13 L53 6 Z"/></svg>`;

    const pumpkin = (x, y, w, z = 3, glow = true) =>
        `<svg viewBox="0 0 120 112" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;z-index:${z};overflow:visible">
          <defs>
            <radialGradient id="pg${x}${y}" cx=".42" cy=".38" r=".75"><stop offset="0" stop-color="#FFC165"/><stop offset=".55" stop-color="#F07A22"/><stop offset="1" stop-color="#A83E0C"/></radialGradient>
            <radialGradient id="pl${x}${y}"><stop offset="0" stop-color="#FFF3A0"/><stop offset=".6" stop-color="#FFC43A"/><stop offset="1" stop-color="#FF8A00"/></radialGradient>
          </defs>
          ${glow ? `<ellipse cx="60" cy="66" rx="78" ry="62" fill="#FF9A2E" opacity=".28" style="filter:blur(14px)"/>` : ''}
          <path d="M57 20 C56 11 60 4 68 2 C70 6 66 9 65 20 Z" fill="#4E6B22"/>
          <path d="M66 12 C74 6 84 8 88 14" stroke="#4E6B22" stroke-width="3" fill="none" stroke-linecap="round"/>
          <ellipse cx="36" cy="66" rx="30" ry="40" fill="url(#pg${x}${y})"/>
          <ellipse cx="84" cy="66" rx="30" ry="40" fill="url(#pg${x}${y})"/>
          <ellipse cx="60" cy="64" rx="34" ry="44" fill="url(#pg${x}${y})"/>
          <path d="M60 22 C50 40 50 90 60 106 M60 22 C70 40 70 90 60 106" stroke="#B9500F" stroke-width="2" fill="none" opacity=".55"/>
          <path d="M38 50 L50 50 L44 38 Z M70 50 L82 50 L76 38 Z" fill="url(#pl${x}${y})"/>
          <path d="M56 58 L64 58 L60 66 Z" fill="url(#pl${x}${y})"/>
          <path d="M32 72 C44 90 76 90 88 72 L80 76 L76 70 L70 78 L64 72 L58 80 L52 72 L46 78 L40 72 Z" fill="url(#pl${x}${y})"/>
        </svg>`;

    const moon = (cx, cy, r, z = 2) =>
        `<div style="position:absolute;left:${cx - r * 2}px;top:${cy - r * 2}px;width:${r * 4}px;height:${r * 4}px;border-radius:50%;z-index:${z};
            background:radial-gradient(circle,rgba(255,170,70,.55) 0%,rgba(255,120,40,.22) 28%,rgba(255,120,40,0) 50%)"></div>
         <svg viewBox="0 0 200 200" style="position:absolute;left:${cx - r}px;top:${cy - r}px;width:${r * 2}px;z-index:${z}">
          <defs><radialGradient id="mg${cx}" cx=".38" cy=".35" r=".7"><stop offset="0" stop-color="#FFF1CF"/><stop offset=".55" stop-color="#FFC274"/><stop offset="1" stop-color="#F08A2E"/></radialGradient></defs>
          <circle cx="100" cy="100" r="100" fill="url(#mg${cx})"/>
          <circle cx="70" cy="80" r="16" fill="#E9953F" opacity=".35"/><circle cx="130" cy="120" r="24" fill="#E9953F" opacity=".3"/>
          <circle cx="112" cy="58" r="9" fill="#E9953F" opacity=".35"/><circle cx="66" cy="140" r="11" fill="#E9953F" opacity=".28"/>
        </svg>`;

    const stars = (seed, n, top, bottom, o = .8, col = '#FFF4DC', glow = '#FFE7B0') => {
        let s = ''; let r = seed;
        const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
        for (let i = 0; i < n; i++) {
            const size = 2 + rnd() * 3;
            s += `<i style="position:absolute;left:${Math.round(rnd() * 1060)}px;top:${Math.round(top + rnd() * (bottom - top))}px;width:${size}px;height:${size}px;border-radius:50%;background:${col};opacity:${(.35 + rnd() * .65) * o};z-index:2;box-shadow:0 0 8px ${glow}"></i>`;
        }
        return s;
    };

    // Tombstones, a dead tree and a fence along the very bottom edge.
    const graveyard = (fill) =>
        `<svg viewBox="0 0 1080 140" style="position:absolute;left:0;bottom:0;width:1080px;z-index:3" preserveAspectRatio="none">
          <path fill="${fill}" d="M0 140 L0 118 C140 104 300 112 440 106 C600 100 760 112 900 104 C980 100 1040 106 1080 102 L1080 140 Z"/>
          <path fill="${fill}" d="M70 118 L70 86 C70 70 110 70 110 86 L110 118 Z M150 116 L150 96 C150 86 176 86 176 96 L176 116 Z M880 110 L880 74 C880 56 924 56 924 74 L924 110 Z M958 108 L966 108 L966 84 L980 84 L980 76 L966 76 L966 64 L958 64 L958 76 L944 76 L944 84 L958 84 Z"/>
          <path stroke="${fill}" stroke-width="7" fill="none" stroke-linecap="round" d="M1030 104 L1030 40 M1030 70 L1008 52 M1030 58 L1054 38 M1008 52 L996 50 M1054 38 L1066 40 M1030 46 L1020 30"/>
          <path stroke="${fill}" stroke-width="4" fill="none" d="M300 110 L300 84 M324 109 L324 82 M348 108 L348 84 M372 108 L372 82 M290 92 L382 90"/>
        </svg>`;

    const candyCorn = (x, y, w) =>
        `<svg viewBox="0 0 40 50" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;z-index:4">
          <path d="M20 2 C26 2 38 36 38 42 C38 48 2 48 2 42 C2 36 14 2 20 2 Z" fill="#FFF6E6"/>
          <path d="M8 26 C12 14 16 6 20 6 C24 6 28 14 32 26 Z" fill="#FF8A1F" transform="translate(0 6)"/>
          <path d="M3 42 C3 38 5 34 7 30 L33 30 C35 34 37 38 37 42 C37 47 3 47 3 42 Z" fill="#FFC928"/>
        </svg>`;

    const ghost = (x, y, w, o = 1, z = 2, face = true) =>
        `<svg viewBox="0 0 80 96" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;opacity:${o};z-index:${z}">
          <path d="M8 44 C8 18 24 4 40 4 C56 4 72 18 72 44 L72 88 L62 80 L52 90 L40 80 L28 90 L18 80 L8 88 Z" fill="#F6F3FF"/>
          ${face ? `<ellipse cx="30" cy="40" rx="5" ry="7" fill="#1B1430"/><ellipse cx="50" cy="40" rx="5" ry="7" fill="#1B1430"/><ellipse cx="40" cy="54" rx="4" ry="5" fill="#1B1430"/>` : ''}
        </svg>`;

    // Corner cobweb. corner: 'tr' | 'bl' | 'tl'
    const cobweb = (corner, size, color = 'rgba(255,255,255,.55)') => {
        const R = [0.2, 0.38, 0.56, 0.75, 0.95].map((f) => f * size);
        const angles = [0, 15, 30, 45, 60, 75, 90].map((a) => a * Math.PI / 180);
        let d = '';
        angles.forEach((a) => { d += `M0 0 L${Math.cos(a) * size} ${Math.sin(a) * size} `; });
        R.forEach((r) => {
            for (let i = 0; i < angles.length - 1; i++) {
                const a0 = angles[i], a1 = angles[i + 1], am = (a0 + a1) / 2;
                d += `M${Math.cos(a0) * r} ${Math.sin(a0) * r} Q${Math.cos(am) * r * 0.86} ${Math.sin(am) * r * 0.86} ${Math.cos(a1) * r} ${Math.sin(a1) * r} `;
            }
        });
        const tf = { tl: '', tr: `translate(${size} 0) scale(-1 1)`, bl: `translate(0 ${size}) scale(1 -1)` }[corner];
        const pos = { tl: 'left:0;top:0', tr: 'right:0;top:0', bl: 'left:0;bottom:0' }[corner];
        return `<svg viewBox="0 0 ${size} ${size}" style="position:absolute;${pos};width:${size}px;z-index:4;pointer-events:none"><g transform="${tf}"><path d="${d}" stroke="${color}" stroke-width="1.6" fill="none"/></g></svg>`;
    };

    const spider = (x, top, len) =>
        `<div style="position:absolute;left:${x}px;top:${top}px;width:2px;height:${len}px;background:rgba(255,255,255,.6);z-index:4"></div>
         <svg viewBox="0 0 60 50" style="position:absolute;left:${x - 29}px;top:${top + len - 10}px;width:60px;z-index:4">
          <g stroke="#0C0818" stroke-width="3" fill="none" stroke-linecap="round">
            <path d="M24 22 L8 10 L2 20 M24 26 L6 26 L0 36 M26 30 L10 40 L6 50 M36 22 L52 10 L58 20 M36 26 L54 26 L60 36 M34 30 L50 40 L54 50"/></g>
          <ellipse cx="30" cy="26" rx="10" ry="12" fill="#0C0818"/><circle cx="30" cy="12" r="7" fill="#0C0818"/>
          <circle cx="27" cy="11" r="2" fill="#FF5A3C"/><circle cx="33" cy="11" r="2" fill="#FF5A3C"/></svg>`;

    const vine = (side, color) =>
        `<svg viewBox="0 0 220 260" style="position:absolute;${side}:0;bottom:0;width:220px;z-index:3;${side === 'right' ? 'transform:scaleX(-1)' : ''}">
          <path d="M0 260 C30 200 20 150 60 120 C90 98 120 110 118 136 C116 156 92 158 88 142 M60 120 C50 80 80 50 120 52 C150 54 160 80 140 92 C126 100 114 88 122 78 M40 190 C70 180 96 196 92 214"
            stroke="${color}" stroke-width="6" fill="none" stroke-linecap="round"/>
          <path d="M68 150 C80 140 98 146 96 160 C84 164 72 160 68 150 Z M110 60 C122 46 142 50 144 64 C130 70 116 68 110 60 Z" fill="${color}"/></svg>`;

    // Small jack-o'-lantern icon for the pill.
    const pillIcon = `<svg viewBox="0 0 24 22" style="width:24px;height:22px;margin-right:10px;vertical-align:-4px"><path d="M11 4 C11 1 13 0 14 0 L14 4 Z" fill="#6B8E23"/>
      <ellipse cx="7" cy="13" rx="6" ry="8" fill="#FF8A1F"/><ellipse cx="17" cy="13" rx="6" ry="8" fill="#FF8A1F"/><ellipse cx="12" cy="13" rx="7" ry="9" fill="#FF9B35"/>
      <path d="M7 11 L10 11 L8.5 8 Z M14 11 L17 11 L15.5 8 Z M7 15 C9 18 15 18 17 15 Z" fill="#3A1405"/></svg>`;

    // ---------- themes ----------
    const THEMES = {
        // A. Blood-orange harvest moon, bats, graveyard: the classic Halloween night.
        moon: {
            bg: 'linear-gradient(180deg,#2A1240 0%,#1A0B2E 45%,#0F0720 75%,#07040F 100%)',
            fade: 'linear-gradient(180deg,rgba(74,52,110,.9) 0%,rgba(38,20,62,.75) 45%,rgba(26,11,46,0) 100%)',
            cloud: ['#8E7DB6', '#5E4B86', '#34224F'], under: '#231437', hl: '#B8A8DC',
            text: '#F6EEDD', acc: '#FF8A1F', dotOff: 'rgba(246,238,221,.28)',
            btn: 'linear-gradient(180deg,#FFB14A,#F0641E)', btnText: '#1A0B10',
            pill: 'background:rgba(26,11,46,.55);border-color:#FF8A1F;color:#FFE4C2',
            shadow: 'drop-shadow(0 0 26px rgba(160,120,230,.35))',
            deco(kind, bank) {
                let s = graveyard('#1E0F33') + stars(kind.length * 17, 36, bank + 260, 1260);
                if (kind === 'cover') s += moon(880, bank + 20, 150) + bat(640, bank - 180, 110, -12) + bat(760, bank - 250, 80, 8) + bat(560, bank - 110, 64, -20) + bat(980, bank - 150, 70, 14);
                else if (kind === 'share') s += moon(930, bank + 10, 110) + bat(700, bank - 130, 90, -10) + bat(820, bank - 190, 64, 12);
                else s += moon(930, bank + 30, 120) + bat(740, bank - 120, 90, -10) + bat(860, bank - 190, 62, 12) + bat(640, bank - 60, 54, -22);
                return s;
            },
        },
        // B. Sunset pumpkin patch: warm, cozy-spooky, candy corn and vines.
        pumpkin: {
            bg: 'linear-gradient(180deg,#F59E4C 0%,#C9482C 40%,#4A1840 62%,#2A0D2C 100%)',
            fade: 'linear-gradient(180deg,rgba(255,176,96,.85) 0%,rgba(150,58,74,.6) 45%,rgba(74,24,64,0) 100%)',
            cloud: ['#FFF0D6', '#FFC37A', '#F08A3E'], under: '#C2562B', hl: '#FFF7E8',
            text: '#FFF3E0', acc: '#FFB93E', dotOff: 'rgba(255,243,224,.3)',
            btn: 'linear-gradient(180deg,#FFD166,#FF8A1F)', btnText: '#3A1020',
            pill: 'background:rgba(74,24,64,.5);border-color:#FFC37A;color:#FFF3E0',
            shadow: 'drop-shadow(0 10px 30px rgba(255,140,60,.45))',
            deco(kind, bank) {
                let s = vine('left', '#1C0718') + vine('right', '#1C0718') + stars(kind.length * 23, 18, bank + 300, 1180, .6);
                if (kind === 'cover') s += pumpkin(40, bank - 40, 170) + pumpkin(210, bank + 10, 110) + pumpkin(840, bank - 60, 200) + pumpkin(740, bank + 20, 96)
                    + candyCorn(300, 988, 24) + candyCorn(756, 988, 24);
                else if (kind === 'share') s += pumpkin(30, bank - 40, 150) + pumpkin(870, bank - 50, 170) + pumpkin(770, bank + 10, 90);
                else s += pumpkin(30, bank - 30, 150) + pumpkin(880, bank - 50, 170) + pumpkin(790, bank + 20, 86);
                return s;
            },
        },
        // C. Ghost parade: the cloud bank itself turns into cute ghosts, webs and a spider.
        ghost: {
            bg: 'linear-gradient(180deg,#3A2C66 0%,#2A2050 45%,#1B1435 75%,#110C22 100%)',
            fade: 'linear-gradient(180deg,rgba(90,76,140,.85) 0%,rgba(48,36,90,.7) 45%,rgba(42,32,80,0) 100%)',
            cloud: ['#FFFFFF', '#F1EDFF', '#D9D2F4'], under: '#B9AEE6', hl: '#FFFFFF',
            text: '#F3F0FF', acc: '#B8F55E', dotOff: 'rgba(243,240,255,.28)',
            btn: 'linear-gradient(180deg,#C8FF7A,#7FD636)', btnText: '#15102A',
            pill: 'background:rgba(27,20,53,.55);border-color:#B8F55E;color:#F3F0FF',
            shadow: 'drop-shadow(0 0 24px rgba(200,190,255,.45))',
            numbers: '#FF9A3C',
            deco(kind, bank) {
                let s = cobweb('tr', 300) + cobweb('bl', 240, 'rgba(255,255,255,.28)');
                s += spider(560, 0, kind === 'cover' ? 250 : 200);
                const g = [[80, bank + 330, 60, .14], [930, bank + 390, 70, .12], [520, 1230, 46, .1]];
                g.forEach(([x, y, w, o]) => { s += ghost(x, y, w, o, 2, false); });
                if (kind === 'cover') s += pumpkin(820, bank + 60, 120, 4);
                return s;
            },
            // Cute faces on every other bank cloud, so the clouds read as ghosts.
            post(slide, kind, bank) {
                const clouds = [...slide.querySelectorAll('svg.cloud')].filter((c) => parseFloat(c.style.top) >= bank - 5);
                clouds.forEach((c, i) => {
                    if (i % 2) return;
                    const l = parseFloat(c.style.left), t = parseFloat(c.style.top), w = parseFloat(c.style.width), h = w * 170 / 400;
                    const flip = c.style.transform.includes('scaleX(-1)');
                    const cx = l + w * (flip ? 0.46 : 0.54), cy = t + h * 0.62;
                    slide.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 120 50" style="position:absolute;left:${cx - 60}px;top:${cy - 25}px;width:120px;z-index:3">
                      <ellipse cx="42" cy="18" rx="7" ry="10" fill="#1B1430"/><ellipse cx="78" cy="18" rx="7" ry="10" fill="#1B1430"/>
                      <circle cx="44" cy="14" r="2.4" fill="#fff"/><circle cx="80" cy="14" r="2.4" fill="#fff"/>
                      <ellipse cx="30" cy="32" rx="8" ry="4" fill="#FF9FC4" opacity=".7"/><ellipse cx="90" cy="32" rx="8" ry="4" fill="#FF9FC4" opacity=".7"/>
                      <path d="M52 34 C56 40 64 40 68 34" stroke="#1B1430" stroke-width="3.5" fill="none" stroke-linecap="round"/></svg>`);
                });
            },
        },
        // D. Midnight Moon: near-black night, smoky fog with orange rim light, huge moon, bat swarm.
        nightmoon: {
            bg: 'linear-gradient(180deg,#140C1C 0%,#0B0710 50%,#050308 100%)',
            fade: 'linear-gradient(180deg,rgba(34,26,44,.95) 0%,rgba(16,11,22,.8) 45%,rgba(11,7,16,0) 100%)',
            cloud: ['#3B3146', '#221B2B', '#120E17'], under: '#08060C', hl: '#FF8A1F',
            text: '#EFE6D8', acc: '#FF8A1F', dotOff: 'rgba(239,230,216,.22)',
            btn: 'linear-gradient(180deg,#FFB14A,#E8561A)', btnText: '#120806',
            pill: 'background:rgba(8,5,12,.6);border-color:#FF8A1F;color:#FFE4C2',
            shadow: 'drop-shadow(0 -6px 22px rgba(255,120,40,.28))',
            deco(kind, bank) {
                let s = graveyard('#1C1426') + stars(kind.length * 17, 40, bank + 260, 1250);
                const swarm = (pts) => pts.map(([x, y, w, r]) => bat(x, y, w, r)).join('');
                if (kind === 'cover') s += moon(860, bank - 10, 190) + swarm([[560, bank - 240, 150, -12], [720, bank - 330, 110, 10], [470, bank - 140, 90, -22], [930, bank - 250, 100, 16], [640, bank - 90, 70, 6], [800, bank - 170, 60, -8]]);
                else if (kind === 'share') s += moon(900, bank - 10, 140) + swarm([[640, bank - 170, 120, -10], [800, bank - 240, 90, 12], [560, bank - 90, 70, -20]]);
                else s += moon(910, bank + 10, 150) + swarm([[660, bank - 170, 130, -10], [820, bank - 250, 96, 12], [560, bank - 90, 76, -22], [980, bank - 140, 70, 18]]);
                return s;
            },
        },
        // E. Lantern Night: pitch-black, charcoal fog glowing from below, jack-o'-lanterns burning on it, embers.
        lantern: {
            bg: 'linear-gradient(180deg,#1A0D08 0%,#0E0706 50%,#060303 100%)',
            fade: 'linear-gradient(180deg,rgba(60,26,12,.9) 0%,rgba(24,11,7,.8) 45%,rgba(14,7,6,0) 100%)',
            cloud: ['#3A2E2A', '#221A17', '#120D0B'], under: '#FF7A1A', hl: '#FFB14A',
            text: '#F5E9DA', acc: '#FF9A2E', dotOff: 'rgba(245,233,218,.22)',
            btn: 'linear-gradient(180deg,#FFC155,#FF7A1A)', btnText: '#1A0A04',
            pill: 'background:rgba(14,7,6,.6);border-color:#FF9A2E;color:#FFE8CC',
            shadow: 'drop-shadow(0 16px 30px rgba(255,110,30,.45))',
            deco(kind, bank) {
                let s = vine('left', '#3A1C10') + vine('right', '#3A1C10') + stars(kind.length * 23, 34, bank + 200, 1260, .9, '#FFB14A', '#FF7A1A');
                if (kind === 'cover') s += pumpkin(30, bank - 50, 180) + pumpkin(210, bank + 10, 110) + pumpkin(830, bank - 70, 210) + pumpkin(730, bank + 20, 96)
                    + candyCorn(300, 988, 24) + candyCorn(756, 988, 24) + bat(600, bank - 220, 110, -10) + bat(470, bank - 160, 70, 14);
                else if (kind === 'share') s += pumpkin(30, bank - 40, 150) + pumpkin(870, bank - 50, 170) + pumpkin(770, bank + 10, 90);
                else s += pumpkin(30, bank - 30, 150) + pumpkin(880, bank - 50, 170) + pumpkin(790, bank + 20, 86);
                return s;
            },
        },
        // F. Crimson Fog: black-red night, something with glowing eyes watches from the fog, webs and bats.
        eyes: {
            bg: 'linear-gradient(180deg,#1A070C 0%,#0D0407 50%,#050203 100%)',
            fade: 'linear-gradient(180deg,rgba(44,14,20,.95) 0%,rgba(20,7,10,.8) 45%,rgba(13,4,7,0) 100%)',
            cloud: ['#3A2027', '#1F1015', '#10080B'], under: '#060204', hl: '#D7263D',
            text: '#F1E7E1', acc: '#E8384F', numbers: '#FF8A1F', dotOff: 'rgba(241,231,225,.22)',
            btn: 'linear-gradient(180deg,#F0506A,#B3172C)', btnText: '#FFF3F0',
            pill: 'background:rgba(13,4,7,.6);border-color:#E8384F;color:#FFE1E4',
            shadow: 'drop-shadow(0 -6px 22px rgba(215,38,61,.3))',
            deco(kind, bank) {
                let s = cobweb('tr', 300, 'rgba(255,235,235,.4)') + cobweb('bl', 240, 'rgba(255,235,235,.2)') + stars(kind.length * 31, 22, bank + 260, 1240, .6, '#FFD9DE', '#E8384F');
                s += spider(560, 0, kind === 'cover' ? 250 : 200);
                if (kind === 'cover') s += bat(640, bank - 230, 120, -12) + bat(790, bank - 300, 84, 10) + bat(520, bank - 130, 70, -20) + pumpkin(840, bank + 50, 120, 4);
                else s += bat(700, bank - 150, 96, -10) + bat(840, bank - 220, 70, 12);
                return s;
            },
            // Pairs of glowing red eyes peering out of the fog.
            post(slide, kind, bank) {
                const clouds = [...slide.querySelectorAll('svg.cloud')].filter((c) => parseFloat(c.style.top) >= bank - 5);
                clouds.forEach((c, i) => {
                    if (i % 2 === 0) return;
                    const l = parseFloat(c.style.left), t = parseFloat(c.style.top), w = parseFloat(c.style.width), h = w * 170 / 400;
                    const cx = l + w * 0.5, cy = t + h * 0.66, sc = 0.8 + (i % 3) * 0.15;
                    slide.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 120 40" style="position:absolute;left:${cx - 60 * sc}px;top:${cy - 20 * sc}px;width:${120 * sc}px;z-index:3;overflow:visible">
                      <ellipse cx="60" cy="20" rx="56" ry="18" fill="#FF2A40" opacity=".18" style="filter:blur(10px)"/>
                      <path d="M30 20 C36 10 50 10 54 20 C50 26 36 26 30 20 Z M66 20 C70 10 84 10 90 20 C84 26 70 26 66 20 Z" fill="#FF3348"/>
                      <ellipse cx="42" cy="19" rx="2.6" ry="5" fill="#2A0006"/><ellipse cx="78" cy="19" rx="2.6" ry="5" fill="#2A0006"/></svg>`);
                });
            },
        },
    };

    function apply(name) {
        const T = THEMES[name];
        const css = `
          .slide{background:${T.bg} !important}
          .slide [style*="color:#0B2A5B"]{color:${T.text} !important}
          .slide [style*="#F4F9FF 0%"]{background:${T.fade} !important}
          .slide [style*="color:#D98E12"]{color:${T.numbers || T.acc} !important}
          .slide [style*="color:#E09A1E"]{color:${T.acc} !important}
          .slide [style*="background:#0B2A5B33"]{background:${T.dotOff} !important}
          .dots i.on{background:${T.acc} !important}
          .cloud{filter:${T.shadow} !important}
          .pill{${T.pill}}
          .btn{background:${T.btn} !important;color:${T.btnText} !important;box-shadow:0 14px 34px rgba(255,120,40,.4) !important}`;
        const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
        const stops = document.querySelectorAll('#cg stop');
        T.cloud.forEach((c, i) => stops[i].setAttribute('stop-color', c));
        const paths = document.querySelectorAll('#cloud path');
        paths[1].setAttribute('fill', T.under); paths[2].setAttribute('stroke', T.hl);
        document.querySelectorAll('.pill').forEach((p) => { p.innerHTML = pillIcon + p.innerHTML; });
        const slides = [...document.querySelectorAll('section.slide')];
        slides.forEach((s, i) => {
            const kind = i === 0 ? 'cover' : i === slides.length - 1 ? 'share' : 'content';
            const bank = { cover: 760, content: 680, share: 500 }[kind];
            s.insertAdjacentHTML('beforeend', T.deco(kind, bank));
            if (T.post) T.post(s, kind, bank);
        });
    }
    return { apply, THEMES };
})();
