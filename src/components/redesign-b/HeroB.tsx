'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './HeroB.module.css';

const LETTERS = 'KUMOLAB'.split('');

const HeroB = () => {
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        requestAnimationFrame(() => setLoaded(true));
    }, []);

    return (
        <section className={styles.hero}>
            {/* Giant kanji watermark drifting behind the wordmark */}
            <div className={styles.kanji} aria-hidden="true">雲</div>

            <div className={`${styles.inner} ${loaded ? styles.loaded : ''}`}>
                <div className={styles.badge}>
                    <span className={styles.badgeDot} />
                    <span className={styles.badgeText}>雲ラボ · BROADCASTING FROM ABOVE THE CLOUDS</span>
                </div>

                <h1 className={styles.wordmark} aria-label="KUMOLAB">
                    {LETTERS.map((letter, i) => (
                        <span
                            key={i}
                            className={styles.letter}
                            style={{ '--i': i } as React.CSSProperties}
                        >
                            {letter}
                        </span>
                    ))}
                </h1>

                <p className={styles.tagline}>
                    Anime intelligence from above the clouds.
                </p>

                <p className={styles.sub}>
                    Verified drops, trailers and industry intel — beamed down daily to 360K+ fans.
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
            </div>

            <div className={`${styles.scrollCue} ${loaded ? styles.loaded : ''}`}>
                <span className={styles.scrollLabel}>SCROLL</span>
                <span className={styles.scrollLine}>
                    <span className={styles.scrollDot} />
                </span>
            </div>
        </section>
    );
};

export default HeroB;
