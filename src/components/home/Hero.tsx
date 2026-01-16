'use client';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import styles from './Hero.module.css';

const Hero = () => {
    return (
        <section className={styles.hero}>
            <div className={styles.heroOverlay}></div>

            <div className={styles.heroContent}>
                <h1 className={styles.headline}>
                    <span className={styles.accentText}>KUMOLAB</span>
                </h1>
                <p className={styles.subheadline}>
                    Anime Updates. Episodes. News. Trends. What’s next? Without the noise.
                </p>

                <div className={styles.buttons}>
                    <Link href="/latest-daily-drop" className={styles.primaryBtn}>
                        View Today&apos;s Drops <span className={styles.arrow}><ArrowRight size={20} /></span>
                    </Link>
                </div>
            </div>

            <div className={styles.scrollIndicator}>
                <div className={styles.mouse}></div>
            </div>
        </section>
    );
};

export default Hero;
