'use client';

import { ArrowRight } from 'lucide-react';
import styles from './Hero.module.css';

const Hero = () => {
    return (
        <section className={styles.hero}>
            <div className={styles.heroOverlay}></div>

            <div className={styles.heroContent}>
                <h1 className={styles.headline}>
                    Welcome to <span className={styles.accentText}>KumoLab</span>
                </h1>
                <p className={styles.subheadline}>
                    Anime updates, drops, and intel, updated daily.
                </p>

                <div className={styles.buttons}>
                    <button className={styles.primaryBtn}>
                        View Today&apos;s Drops <ArrowRight size={20} />
                    </button>
                </div>
            </div>

            <div className={styles.scrollIndicator}>
                <div className={styles.mouse}></div>
            </div>
        </section>
    );
};

export default Hero;
