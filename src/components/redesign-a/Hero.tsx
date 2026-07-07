'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './Hero.module.css';

const LETTERS = ['K', 'U', 'M', 'O', 'L', 'A', 'B'];

/* Cloud fields — {top, left, width(vmin), opacity, blur(px), driftDuration(s), delay(s)} */
const FAR_CLOUDS = [
    { t: '14%', l: '6%', w: 34, o: 0.32, b: 14, d: 46, de: -8 },
    { t: '9%', l: '58%', w: 42, o: 0.26, b: 16, d: 54, de: -20 },
    { t: '22%', l: '76%', w: 30, o: 0.3, b: 13, d: 50, de: -34 },
    { t: '27%', l: '30%', w: 26, o: 0.22, b: 12, d: 58, de: -14 },
];

const MID_CLOUDS = [
    { t: '38%', l: '-6%', w: 52, o: 0.42, b: 18, d: 40, de: -6 },
    { t: '44%', l: '52%', w: 60, o: 0.38, b: 20, d: 48, de: -26 },
    { t: '34%', l: '68%', w: 40, o: 0.34, b: 16, d: 44, de: -16 },
];

const NEAR_CLOUDS = [
    { t: '58%', l: '-10%', w: 82, o: 0.55, b: 26, d: 36, de: -4 },
    { t: '64%', l: '34%', w: 96, o: 0.6, b: 30, d: 42, de: -18 },
    { t: '56%', l: '62%', w: 70, o: 0.5, b: 24, d: 38, de: -30 },
];

const MOTES = [
    { x: '8%', de: 0, du: 16, s: 3 },
    { x: '18%', de: -4, du: 20, s: 2 },
    { x: '29%', de: -9, du: 18, s: 4 },
    { x: '41%', de: -2, du: 22, s: 2 },
    { x: '52%', de: -12, du: 17, s: 3 },
    { x: '63%', de: -6, du: 21, s: 2 },
    { x: '74%', de: -15, du: 19, s: 3 },
    { x: '85%', de: -3, du: 23, s: 2 },
    { x: '93%', de: -10, du: 18, s: 3 },
];

function CloudField({
    clouds,
    layerClass,
    cloudClass,
}: {
    clouds: typeof FAR_CLOUDS;
    layerClass: string;
    cloudClass: string;
}) {
    return (
        <div className={layerClass} aria-hidden="true">
            {clouds.map((c, i) => (
                <div
                    key={i}
                    className={cloudClass}
                    style={
                        {
                            top: c.t,
                            left: c.l,
                            '--w': `${c.w}vmin`,
                            '--o': c.o,
                            '--b': `${c.b}px`,
                            '--d': `${c.d}s`,
                            '--de': `${c.de}s`,
                        } as React.CSSProperties
                    }
                />
            ))}
        </div>
    );
}

const Hero = () => {
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        requestAnimationFrame(() => setLoaded(true));
    }, []);

    return (
        <section className={styles.hero}>
            {/* ── The dawn sky ─────────────────────────────────── */}
            <div className={styles.sky} aria-hidden="true">
                <div className={styles.stars} />
                <div className={styles.halo} />
                <div className={styles.sun} />

                <CloudField clouds={FAR_CLOUDS} layerClass={styles.layerFar} cloudClass={styles.cloudFar} />
                <CloudField clouds={MID_CLOUDS} layerClass={styles.layerMid} cloudClass={styles.cloudMid} />
                <CloudField clouds={NEAR_CLOUDS} layerClass={styles.layerNear} cloudClass={styles.cloudNear} />

                {/* Light motes drifting up through the dawn */}
                <div className={styles.motes}>
                    {MOTES.map((m, i) => (
                        <span
                            key={i}
                            className={styles.mote}
                            style={
                                {
                                    left: m.x,
                                    width: m.s,
                                    height: m.s,
                                    '--du': `${m.du}s`,
                                    '--de': `${m.de}s`,
                                } as React.CSSProperties
                            }
                        />
                    ))}
                </div>

                {/* Cloud-bank horizon: two silhouettes ease the hero into the sections below */}
                <svg
                    className={styles.bankBack}
                    viewBox="0 0 1440 240"
                    preserveAspectRatio="none"
                >
                    <path
                        d="M0,240 L0,150 Q70,100 150,130 Q220,70 320,118 Q400,80 480,126 Q580,58 690,116 Q770,86 850,124 Q930,66 1030,118 Q1110,84 1190,126 Q1290,74 1380,124 Q1410,108 1440,132 L1440,240 Z"
                        fill="rgba(60, 38, 74, 0.85)"
                    />
                </svg>
                <svg
                    className={styles.bankFront}
                    viewBox="0 0 1440 240"
                    preserveAspectRatio="none"
                >
                    <path
                        d="M0,240 L0,170 Q60,128 140,152 Q210,104 310,146 Q390,112 470,150 Q570,92 680,144 Q760,118 840,150 Q920,100 1020,146 Q1100,116 1180,150 Q1280,106 1370,148 Q1405,134 1440,154 L1440,240 Z"
                        fill="#17122a"
                    />
                </svg>

                <div className={styles.noise} />
            </div>

            {/* ── Content ──────────────────────────────────────── */}
            <div className={`${styles.inner} ${loaded ? styles.loaded : ''}`}>
                <div className={styles.kanji} aria-hidden="true">
                    雲
                </div>

                <div className={styles.badge}>
                    <span className={styles.badgeDot} />
                    <span className={styles.badgeText}>雲の上から · From Above the Clouds</span>
                </div>

                <h1 className={styles.wordmark} aria-label="KumoLab">
                    {LETTERS.map((ch, i) => (
                        <span
                            key={i}
                            className={styles.letter}
                            style={{ '--i': i } as React.CSSProperties}
                            aria-hidden="true"
                        >
                            {ch}
                        </span>
                    ))}
                </h1>

                <p className={styles.tagline}>Anime, above the noise.</p>

                <p className={styles.sub}>
                    Verified drops, trailers, and industry intel — curated daily for 360K+ fans.
                    And now: the first KumoLab collection has landed.
                </p>

                <div className={styles.ctas}>
                    <Link href="/merch" className={styles.primaryCta}>
                        <span className={styles.ctaShine} />
                        <span className={styles.ctaText}>Shop the Collection</span>
                    </Link>
                    <Link href="/blog" className={styles.secondaryCta}>
                        <span className={styles.ctaText}>Explore the Feed →</span>
                    </Link>
                </div>

                <div className={styles.scrollCue}>
                    <span className={styles.scrollLabel}>Descend</span>
                    <span className={styles.scrollLine} />
                </div>
            </div>
        </section>
    );
};

export default Hero;
