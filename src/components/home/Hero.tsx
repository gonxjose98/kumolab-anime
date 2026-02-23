'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown, Shield, Clock, Ban } from 'lucide-react';
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
                {/* Main Headline */}
                <div className={styles.headlineContainer}>
                    <h1 className={styles.mainHeadline}>Daily Anime Intelligence</h1>
                    <p className={styles.subtitle}>
                        Confirmed release dates, trailers, and news — verified by KumoLab
                    </p>
                </div>

                {/* CTA Button */}
                <div className={styles.buttons}>
                    <Link href="/latest-daily-drop" className={styles.primaryBtn}>
                        <span>View Today&apos;s Drops</span>
                        <ArrowRight size={isMobile ? 18 : 20} className={styles.arrow} />
                    </Link>
                </div>

                {/* Trust Badges */}
                <div className={styles.trustBadges}>
                    <div className={styles.badge}>
                        <Shield size={14} className={styles.badgeIcon} />
                        <span>Verified Sources</span>
                    </div>
                    <div className={styles.badge}>
                        <Clock size={14} className={styles.badgeIcon} />
                        <span>Daily Updates</span>
                    </div>
                    <div className={styles.badge}>
                        <Ban size={14} className={styles.badgeIcon} />
                        <span>Zero Spam</span>
                    </div>
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
