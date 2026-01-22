'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import styles from './Hero.module.css';

const Hero = () => {
    const [offset, setOffset] = useState(0);
    const [hasAnimated, setHasAnimated] = useState(false);

    useEffect(() => {
        const played = sessionStorage.getItem('hero_animated');
        if (played) {
            setHasAnimated(true);
        } else {
            setHasAnimated(false);
            sessionStorage.setItem('hero_animated', 'true');
        }

        const handleScroll = () => {

            setOffset(window.scrollY);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Very subtle parallax: 1.5% of scroll
    const parallaxTranslate = offset * 0.015;

    return (
        <section className={styles.hero}>
            <div
                className={styles.parallaxBg}
                style={{ transform: `translateY(${parallaxTranslate}px)` }}
            />
            <div className={styles.heroOverlay}></div>

            <div className={`${styles.heroContent} ${hasAnimated ? styles.hasAnimated : ''}`}>
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
