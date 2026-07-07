'use client';

import { useEffect, useRef, useState } from 'react';
import type { SkyWeather as SkyWeatherData } from '@/lib/weather';
import styles from './SkyWeather.module.css';

/**
 * ═══ AMBIENT WEATHER LAYER ═══════════════════════════════════════════
 * A fixed, full-viewport, pointer-transparent overlay that makes the
 * cel-shaded sky react to the visitor's real local weather. Fetched once
 * from GET /api/weather — the page's query string is forwarded, so
 * `?weather=thunder&season=winter` previews any state. Renders nothing
 * until the fetch resolves (and nothing on error): the calm sky.
 *
 * Layers, bottom → top inside this overlay:
 *   tintDay / tintNight — overcast mood veils, composed with the
 *                         inherited day/night variable `--t` (0 = day,
 *                         1 = night; set by SkyThemeRoot/SkyContentRoot)
 *   cloudBand           — slate cel storm clouds along the top edge
 *   canvas              — rain streaks / snow flakes; ONE rAF loop,
 *                         DPR-capped, counts capped hard on phones
 *   bolt + flash        — thunder: soft double-blink every 25–35s
 *   shootingStar        — night only (`--t` ≥ 0.5 at fire time), only
 *                         when the sky is visible (clear / cloudy)
 *   caption             — whisper-quiet "☔ Raining in {place}"
 *
 * The overlay root is `z-index: 1`: above the sky backdrops (z 0 / auto),
 * below any content that declares z-index ≥ 1 later in the DOM, and far
 * below the global nav (z 1000). All animation is transform + opacity
 * (clouds / flash / star) or the single canvas — no layout properties.
 * Under prefers-reduced-motion only the static tint remains.
 */

/* Rain wind: horizontal drift as a fraction of fall speed (~12° slant). */
const SLANT = 0.22;

type Drop = { x: number; y: number; len: number; spd: number };
type Flake = {
    x: number;
    y: number;
    r: number;
    spd: number;
    amp: number;
    ph: number;
    frq: number;
};

/* Cel-shaded storm cloud — a slate-grey echo of the site's cumulus art
   (same lump construction as CelCloudWide, moodier stepped tones). */
function StormCloud({ id, className }: { id: string; className?: string }) {
    const cid = `skyw-storm-${id}`;
    const w = 430;
    const h = 158;
    const lumps: [number, number, number][] = [
        [48, 116, 32],
        [98, 86, 44],
        [156, 62, 52],
        [222, 54, 54],
        [286, 68, 48],
        [344, 88, 40],
        [390, 114, 30],
    ];
    return (
        <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden="true">
            <defs>
                <clipPath id={cid}>
                    {lumps.map(([cx, cy, r], i) => (
                        <circle key={i} cx={cx} cy={cy} r={r} />
                    ))}
                    <rect x="44" y="58" width="352" height="98" rx="40" />
                    <rect x="20" y="110" width="392" height="46" rx="23" />
                </clipPath>
            </defs>
            <g clipPath={`url(#${cid})`}>
                {/* dark rain-belly base → lit crown, crisp cel steps */}
                <rect width={w} height={h} fill="#4b5a6e" />
                {lumps.map(([cx, cy, r], i) => (
                    <circle key={`m-${i}`} cx={cx} cy={cy - 12} r={r * 0.99} fill="#63758b" />
                ))}
                {lumps.map(([cx, cy, r], i) => (
                    <circle key={`u-${i}`} cx={cx} cy={cy - 26} r={r * 0.97} fill="#7b8da3" />
                ))}
                {lumps.map(([cx, cy, r], i) => (
                    <circle key={`c-${i}`} cx={cx + r * 0.1} cy={cy - 40} r={r * 0.95} fill="#93a5ba" />
                ))}
            </g>
        </svg>
    );
}

function captionFor(d: SkyWeatherData): string | null {
    if (!d.place || d.source !== 'live') return null;
    switch (d.condition) {
        case 'rain':
            return `☔ Raining in ${d.place}`;
        case 'snow':
            return `❄ Snowing in ${d.place}`;
        case 'thunder':
            return `⛈ Storm over ${d.place}`;
        default:
            return null;
    }
}

export default function SkyWeather() {
    const [data, setData] = useState<SkyWeatherData | null>(null);
    const [reduced, setReduced] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const flashRef = useRef<HTMLDivElement>(null);
    const boltRef = useRef<HTMLDivElement>(null);
    const starRef = useRef<HTMLDivElement>(null);

    /* Fetch once on mount, forwarding the page's query string so
       ?weather= / ?season= preview overrides reach the route. */
    useEffect(() => {
        let alive = true;
        fetch('/api/weather' + window.location.search)
            .then((r) => (r.ok ? r.json() : null))
            .then((j: unknown) => {
                if (alive && j && typeof j === 'object' && 'condition' in j) {
                    setData(j as SkyWeatherData);
                }
            })
            .catch(() => {
                /* calm sky */
            });
        return () => {
            alive = false;
        };
    }, []);

    /* Respect prefers-reduced-motion, live. */
    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReduced(mq.matches);
        const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
        mq.addEventListener?.('change', onChange);
        return () => mq.removeEventListener?.('change', onChange);
    }, []);

    /* Read the inherited day/night variable at this moment (0 day → 1
       night). Checked when timers fire so toggling day↔night correctly
       starts/stops night-only effects. */
    const readT = () => {
        const el = rootRef.current;
        if (!el) return 0;
        const v = parseFloat(getComputedStyle(el).getPropertyValue('--t'));
        return Number.isFinite(v) ? v : 0;
    };

    /* ── Precipitation: one rAF loop, one canvas ─────────────────────── */
    useEffect(() => {
        if (!data || reduced) return;
        const mode: 'rain' | 'snow' | null =
            data.condition === 'snow'
                ? 'snow'
                : data.condition === 'rain' || data.condition === 'thunder'
                    ? 'rain'
                    : null;
        const canvas = canvasRef.current;
        if (!mode || !canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const intensity = Math.min(1, Math.max(0, data.intensity ?? 0.4));
        /* A whisper of season in the drizzle's hue. */
        const rainColor =
            data.season === 'autumn'
                ? 'rgb(226, 227, 238)'
                : data.season === 'winter'
                    ? 'rgb(211, 227, 248)'
                    : 'rgb(219, 233, 250)';

        let w = 0;
        let h = 0;
        let slack = 0;
        let dropsFar: Drop[] = [];
        let dropsNear: Drop[] = [];
        let flakesFar: Flake[] = [];
        let flakesNear: Flake[] = [];

        const build = () => {
            const areaScale = Math.min((w * h) / (1440 * 900), 1.5);
            if (mode === 'rain') {
                /* Hard mobile caps: ≤26 drops under 480px, ≤44 under 768px. */
                const cap = w < 480 ? 26 : w < 768 ? 44 : 120;
                const total = Math.max(
                    10,
                    Math.min(Math.round((26 + intensity * 100) * areaScale), cap)
                );
                const nFar = Math.round(total * 0.42);
                const mk = (near: boolean): Drop => ({
                    x: Math.random() * (w + slack) - slack,
                    y: Math.random() * h,
                    len: near ? 15 + Math.random() * 8 : 9 + Math.random() * 5,
                    spd: near ? 720 + Math.random() * 260 : 460 + Math.random() * 180,
                });
                dropsFar = Array.from({ length: nFar }, () => mk(false));
                dropsNear = Array.from({ length: total - nFar }, () => mk(true));
            } else {
                /* Hard mobile caps: ≤22 flakes under 480px, ≤34 under 768px. */
                const cap = w < 480 ? 22 : w < 768 ? 34 : 85;
                const total = Math.max(
                    8,
                    Math.min(Math.round((16 + intensity * 75) * areaScale), cap)
                );
                const nFar = Math.round(total * 0.45);
                const mk = (near: boolean): Flake => ({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    r: near ? 1.6 + Math.random() * 1.3 : 0.8 + Math.random() * 0.8,
                    spd: near ? 46 + Math.random() * 34 : 26 + Math.random() * 18,
                    amp: near ? 10 + Math.random() * 16 : 6 + Math.random() * 10,
                    ph: Math.random() * Math.PI * 2,
                    frq: near ? 0.45 + Math.random() * 0.5 : 0.3 + Math.random() * 0.35,
                });
                flakesFar = Array.from({ length: nFar }, () => mk(false));
                flakesNear = Array.from({ length: total - nFar }, () => mk(true));
            }
        };

        const resize = () => {
            w = window.innerWidth;
            h = window.innerHeight;
            slack = h * SLANT + 40;
            /* Cap DPR (1.5 on phones) — huge fill-rate savings, no visible loss. */
            const dpr = Math.min(window.devicePixelRatio || 1, w < 768 ? 1.5 : 2);
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            build();
        };

        const stepDrops = (list: Drop[], dt: number) => {
            for (const d of list) {
                d.y += d.spd * dt;
                d.x += d.spd * SLANT * dt;
                if (d.y > h + 24) {
                    d.y = -24 - Math.random() * 60;
                    d.x = Math.random() * (w + slack) - slack;
                }
                if (d.x > w + 24) d.x -= w + slack + 48;
            }
        };

        const drawDrops = (list: Drop[], alpha: number, width: number) => {
            ctx.globalAlpha = alpha;
            ctx.lineWidth = width;
            ctx.beginPath();
            for (const d of list) {
                ctx.moveTo(d.x, d.y);
                ctx.lineTo(d.x + d.len * SLANT, d.y + d.len);
            }
            ctx.stroke();
        };

        const stepFlakes = (list: Flake[], dt: number) => {
            for (const f of list) {
                f.y += f.spd * dt;
                f.x += 5 * dt; /* faint steady breeze */
                if (f.y > h + 8) {
                    f.y = -8;
                    f.x = Math.random() * w;
                }
                if (f.x > w + 8) f.x -= w + 16;
            }
        };

        const drawFlakes = (list: Flake[], alpha: number, now: number) => {
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            for (const f of list) {
                const fx = f.x + Math.sin(f.ph + now * 0.001 * f.frq) * f.amp;
                ctx.moveTo(fx + f.r, f.y);
                ctx.arc(fx, f.y, f.r, 0, Math.PI * 2);
            }
            ctx.fill();
        };

        let raf = 0;
        let last = 0;
        let running = false;

        const frame = (now: number) => {
            const dt = Math.min((now - last) / 1000, 0.05);
            last = now;
            ctx.clearRect(0, 0, w, h);
            if (mode === 'rain') {
                ctx.strokeStyle = rainColor;
                ctx.lineCap = 'round';
                stepDrops(dropsFar, dt);
                drawDrops(dropsFar, 0.15, 1);
                stepDrops(dropsNear, dt);
                drawDrops(dropsNear, 0.28, 1.4);
            } else {
                ctx.fillStyle = '#ffffff';
                stepFlakes(flakesFar, dt);
                drawFlakes(flakesFar, 0.35, now);
                stepFlakes(flakesNear, dt);
                drawFlakes(flakesNear, 0.6, now);
            }
            ctx.globalAlpha = 1;
            raf = requestAnimationFrame(frame);
        };

        const start = () => {
            if (running) return;
            running = true;
            last = performance.now();
            raf = requestAnimationFrame(frame);
        };
        const stop = () => {
            running = false;
            cancelAnimationFrame(raf);
        };
        const onVis = () => (document.hidden ? stop() : start());

        resize();
        start();
        window.addEventListener('resize', resize);
        document.addEventListener('visibilitychange', onVis);
        return () => {
            stop();
            window.removeEventListener('resize', resize);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, [data, reduced]);

    /* ── Lightning: soft double-blink every 25–35s (first after ~3–6s) ── */
    useEffect(() => {
        if (!data || reduced || data.condition !== 'thunder') return;
        let tm = 0;
        let disposed = false;

        const fire = () => {
            if (disposed) return;
            const flash = flashRef.current;
            if (flash) {
                flash.style.setProperty('--flash-x', `${25 + Math.random() * 55}%`);
                flash.classList.remove(styles.flashRun);
                void flash.offsetWidth; /* restart the keyframes */
                flash.classList.add(styles.flashRun);
            }
            const bolt = boltRef.current;
            if (bolt && Math.random() < 0.55) {
                bolt.style.left = `${15 + Math.random() * 62}%`;
                bolt.classList.remove(styles.boltRun);
                void bolt.offsetWidth;
                bolt.classList.add(styles.boltRun);
            }
            tm = window.setTimeout(fire, 25000 + Math.random() * 10000);
        };

        tm = window.setTimeout(fire, 3200 + Math.random() * 2800);
        return () => {
            disposed = true;
            clearTimeout(tm);
        };
    }, [data, reduced]);

    /* ── Shooting star: night only, every 25–35s, when the sky shows ─── */
    useEffect(() => {
        if (!data || reduced) return;
        if (data.condition !== 'clear' && data.condition !== 'cloudy') return;
        let tm = 0;
        let disposed = false;

        const fire = () => {
            if (disposed) return;
            /* Check --t at fire time: day↔night toggles start/stop it. */
            if (readT() >= 0.5) {
                const el = starRef.current;
                if (el) {
                    el.style.top = `${6 + Math.random() * 20}%`;
                    el.style.left = `${5 + Math.random() * 55}%`;
                    el.classList.remove(styles.starRun);
                    void el.offsetWidth;
                    el.classList.add(styles.starRun);
                }
            }
            tm = window.setTimeout(fire, 25000 + Math.random() * 10000);
        };

        tm = window.setTimeout(fire, 10000 + Math.random() * 8000);
        return () => {
            disposed = true;
            clearTimeout(tm);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, reduced]);

    if (!data) return null; /* pre-fetch and on error: calm sky */

    const { condition } = data;
    const overcast =
        condition === 'cloudy' ||
        condition === 'rain' ||
        condition === 'thunder' ||
        condition === 'snow';
    const precip =
        condition === 'rain' || condition === 'snow' || condition === 'thunder';
    const canShoot =
        !reduced && (condition === 'clear' || condition === 'cloudy');
    const caption = captionFor(data);

    return (
        <div
            ref={rootRef}
            className={styles.weather}
            data-condition={condition}
            data-season={data.season}
            aria-hidden="true"
        >
            {overcast && (
                <>
                    <div className={styles.tintDay} />
                    <div className={styles.tintNight} />
                    {!reduced && (
                        <div className={styles.cloudBand}>
                            <StormCloud id="a" className={`${styles.stormCloud} ${styles.scA}`} />
                            <StormCloud id="b" className={`${styles.stormCloud} ${styles.scB}`} />
                            <StormCloud id="c" className={`${styles.stormCloud} ${styles.scC}`} />
                        </div>
                    )}
                </>
            )}
            {precip && !reduced && <canvas ref={canvasRef} className={styles.canvas} />}
            {condition === 'thunder' && !reduced && (
                <>
                    <div ref={boltRef} className={styles.bolt}>
                        <svg viewBox="0 0 60 200" preserveAspectRatio="none" aria-hidden="true">
                            <path
                                d="M36 0 L23 64 L33 68 L16 130 L26 133 L10 200"
                                fill="none"
                                stroke="#e8f2ff"
                                strokeWidth="3.2"
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                        </svg>
                    </div>
                    <div ref={flashRef} className={styles.flash} />
                </>
            )}
            {canShoot && <div ref={starRef} className={styles.shootingStar} />}
            {caption && <div className={styles.caption}>{caption}</div>}
        </div>
    );
}
