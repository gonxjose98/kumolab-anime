import styles from './NightSky.module.css';

/* ─── Deterministic star-field generation ────────────────────────────
   Seeded LCG so the server render and client hydration produce the
   exact same box-shadow strings (no hydration mismatch, no 'use client'
   needed — this whole component is a zero-JS server component).       */

function lcg(seed: number) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/** Generates `count` stars as one big box-shadow list spread over a
 *  w×h px field. `glow` adds a blur radius so near stars bloom. */
function makeStars(
    count: number,
    w: number,
    h: number,
    seed: number,
    color: string,
    glow = 0,
): string {
    const rnd = lcg(seed);
    const pts: string[] = [];
    for (let i = 0; i < count; i++) {
        const x = Math.round(rnd() * w);
        const y = Math.round(rnd() * h);
        pts.push(glow > 0 ? `${x}px ${y}px ${glow}px ${color}` : `${x}px ${y}px ${color}`);
    }
    return pts.join(', ');
}

/* Field is 2400px wide × 3200px tall — wide enough for large monitors,
   tall enough that parallax translation never runs out of stars. */
const FIELD_W = 2400;
const FIELD_H = 3200;

const STARS_FAR = makeStars(220, FIELD_W, FIELD_H, 7, 'rgba(214, 222, 255, 0.55)');
const STARS_MID_A = makeStars(90, FIELD_W, FIELD_H, 42, 'rgba(196, 226, 255, 0.85)');
const STARS_MID_B = makeStars(80, FIELD_W, FIELD_H, 1337, 'rgba(226, 214, 255, 0.8)');
const STARS_NEAR = makeStars(42, FIELD_W, FIELD_H, 2049, 'rgba(190, 234, 255, 0.95)', 4);

const NightSky = () => {
    return (
        <div className={styles.sky} aria-hidden="true">
            {/* Deep indigo→violet vertical wash */}
            <div className={styles.skyBase} />

            {/* Nebula glows — violet core, cyan wisp, faint pink dust */}
            <div className={styles.nebulaViolet} />
            <div className={styles.nebulaCyan} />
            <div className={styles.nebulaPink} />

            {/* Moon with halo */}
            <div className={styles.moonHalo} />
            <div className={styles.moon} />

            {/* Parallax star layers (far → near = slow → fast) */}
            <div className={styles.parallaxFar}>
                <span className={styles.starDotSm} style={{ boxShadow: STARS_FAR }} />
            </div>
            <div className={styles.parallaxMid}>
                <span
                    className={`${styles.starDotMd} ${styles.twinkleA}`}
                    style={{ boxShadow: STARS_MID_A }}
                />
                <span
                    className={`${styles.starDotMd} ${styles.twinkleB}`}
                    style={{ boxShadow: STARS_MID_B }}
                />
            </div>
            <div className={styles.parallaxNear}>
                <span
                    className={`${styles.starDotLg} ${styles.twinkleC}`}
                    style={{ boxShadow: STARS_NEAR }}
                />
            </div>

            {/* Shooting stars */}
            <div className={styles.shoot1} />
            <div className={styles.shoot2} />

            {/* Volumetric clouds, lit from within — far band + near band */}
            <div className={styles.cloudsFar}>
                <div className={`${styles.cloud} ${styles.cloudA}`} />
                <div className={`${styles.cloud} ${styles.cloudB}`} />
                <div className={`${styles.cloud} ${styles.cloudC}`} />
            </div>
            <div className={styles.cloudsNear}>
                <div className={`${styles.cloud} ${styles.cloudD}`} />
                <div className={`${styles.cloud} ${styles.cloudE}`} />
                <div className={`${styles.cloud} ${styles.cloudF}`} />
            </div>

            {/* Film grain to kill gradient banding */}
            <div className={styles.grain} />

            {/* Gentle vignette for cinematic focus */}
            <div className={styles.vignette} />
        </div>
    );
};

export default NightSky;
