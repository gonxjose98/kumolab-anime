'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import styles from './Hero.module.css';

const Hero = () => {
    const [offset, setOffset] = useState(0);
    const [isAnimating, setIsAnimating] = useState(true);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        // Check mobile
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);

        // Initial Page Load Check
        const played = sessionStorage.getItem('hero_animated');
        if (!played) {
            setIsAnimating(true);
            sessionStorage.setItem('hero_animated', 'true');
            // End animation after sequence completes
            setTimeout(() => setIsAnimating(false), 2000);
        } else {
            setIsAnimating(false);
        }

        const handleScroll = () => {
            setOffset(window.scrollY);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        
        return () => {
            window.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', checkMobile);
        };
    }, []);

    // Subtle parallax - reduced on mobile
    const parallaxTranslate = offset * (isMobile ? 0.008 : 0.015);

    return (
        <section className={styles.hero}>
            <div
                className={styles.parallaxBg}
                style={{ transform: `translateY(${parallaxTranslate}px)` }}
            />
            <div className={styles.heroOverlay}></div>

            <div className={`${styles.heroContent} ${isAnimating ? styles.animating : ''}`}>
                {/* Animated Logo */}
                <div className={styles.logoContainer}>
                    <span className={styles.accentText}>KUMOLAB</span>
                    <div className={styles.underline}></div>
                </div>
                
                {/* Tagline with staggered animation */}
                <p className={styles.subheadline}>
                    <span className={styles.line1}>Anime Updates. Episodes. News.</span>
                    <span className={styles.line2}>What&apos;s next? Without the noise.</span>
                </p>

                {/* CTA Button */}
                <div className={styles.buttons}>
                    <Link href="/latest-daily-drop" className={styles.primaryBtn}>
                        <span>View Today&apos;s Drops</span>
                        <ArrowRight size={isMobile ? 18 : 20} className={styles.arrow} />
                    </Link>
                </div>
            </div>

            {/* Scroll Indicator */}
            <div className={styles.scrollIndicator}>
                <div className={styles.scrollContent}>
                    <span className={styles.scrollText}>Scroll</span>
                    <ChevronDown size={20} className={styles.scrollIcon} />
                </div>
            </div>
        </section>
    );
};

export default Hero;
