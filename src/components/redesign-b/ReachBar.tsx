'use client';

import styles from './ReachBar.module.css';
import { useReveal, useCountUp } from './useReveal';

const PLATFORMS = ['YouTube', 'TikTok', 'Instagram', 'X', 'Threads'];

const ReachBar = () => {
    const { ref, visible } = useReveal<HTMLElement>(0.25);

    const fans = useCountUp(360, visible, 2200);
    const views = useCountUp(12, visible, 2400);
    const drops = useCountUp(500, visible, 2600);

    return (
        <section ref={ref} className={`${styles.section} ${visible ? styles.visible : ''}`}>
            <div className={styles.panel}>
                <p className={styles.statement}>
                    Trusted by{' '}
                    <span className={styles.bigNumber}>
                        {fans}K<span className={styles.plus}>+</span>
                    </span>{' '}
                    anime fans monthly
                </p>

                <div className={styles.statRow}>
                    <div className={styles.stat}>
                        <span className={styles.statValue}>
                            {views}M<span className={styles.plus}>+</span>
                        </span>
                        <span className={styles.statLabel}>Views across platforms</span>
                        <span className={styles.statJp}>総再生数</span>
                    </div>
                    <span className={styles.divider} />
                    <div className={styles.stat}>
                        <span className={styles.statValue}>
                            {drops}
                            <span className={styles.plus}>+</span>
                        </span>
                        <span className={styles.statLabel}>Verified drops published</span>
                        <span className={styles.statJp}>確認済み</span>
                    </div>
                    <span className={styles.divider} />
                    <div className={styles.stat}>
                        <span className={styles.statValue}>24/7</span>
                        <span className={styles.statLabel}>Signal, zero noise</span>
                        <span className={styles.statJp}>ノイズゼロ</span>
                    </div>
                </div>

                <div className={styles.platforms}>
                    {PLATFORMS.map((p, i) => (
                        <span
                            key={p}
                            className={styles.platform}
                            style={{ '--d': `${i * 0.08}s` } as React.CSSProperties}
                        >
                            {p}
                        </span>
                    ))}
                    <span className={styles.handle}>@kumolabanime</span>
                </div>
            </div>
        </section>
    );
};

export default ReachBar;
