'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './Hero.module.css';

const Hero = () => {
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        requestAnimationFrame(() => setLoaded(true));
    }, []);

    return (
        <section className={styles.hero}>
            {/* Ambient gradient orbs */}
            <div className={styles.ambientGradients} />
            <div className={styles.orb1} />
            <div className={styles.orb2} />
            <div className={styles.gridOverlay} />

            <div className={`${styles.heroContent} ${loaded ? styles.loaded : ''}`}>
                {/* Live badge */}
                <div className={styles.liveBadge}>
                    <span className={styles.liveDot} />
                    <span className={styles.liveText}>ライブ — Live Intelligence Feed</span>
                </div>

                {/* Main headline */}
                <h1 className={styles.mainHeadline}>
                    Your Anime<br />
                    <span className={styles.gradientText}>Intelligence Hub</span>
                </h1>

                {/* Japanese subtitle */}
                <div className={styles.jpSubtitle}>アニメ・インテリジェンス・ハブ</div>

                {/* Description */}
                <p className={styles.description}>
                    Real-time tracking of every anime announcement, trailer drop, and industry move. Verified intel. Zero noise.
                </p>

                {/* CTA Buttons */}
                <div className={styles.buttons}>
                    <Link href="/latest-daily-drop" className={styles.primaryBtn}>
                        <span className={styles.btnShine} />
                        <span className={styles.btnText}>View Today&apos;s Drops</span>
                    </Link>
                    <Link href="/blog" className={styles.secondaryBtn}>
                        <span className={styles.btnAccentTop} />
                        <span className={styles.btnAccentBottom} />
                        <span className={styles.btnText}>Explore Feed →</span>
                    </Link>
                </div>

                {/* Scroll indicator */}
                <div className={styles.scrollIndicator}>
                    <div className={styles.scrollMouse}>
                        <div className={styles.scrollDot} />
                    </div>
                </div>
            </div>
        </section>
    );
};

export default Hero;
