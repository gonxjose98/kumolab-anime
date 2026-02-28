'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import styles from './StatsBar.module.css';

interface Stats {
    todayDrops: number;
    trending: number;
    verifiedThisWeek: number;
}

function useCountUp(end: number, duration: number = 2200) {
    const [count, setCount] = useState(0);
    const [started, setStarted] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([e]) => {
                if (e.isIntersecting) {
                    setStarted(true);
                    obs.disconnect();
                }
            },
            { threshold: 0.3 }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    useEffect(() => {
        if (!started || end === 0) return;
        let v = 0;
        const step = end / (duration / 16);
        const t = setInterval(() => {
            v += step;
            if (v >= end) {
                setCount(end);
                clearInterval(t);
            } else {
                setCount(Math.floor(v));
            }
        }, 16);
        return () => clearInterval(t);
    }, [started, end, duration]);

    return { count, ref };
}

function useInView() {
    const ref = useRef<HTMLElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([e]) => {
                if (e.isIntersecting) {
                    setVisible(true);
                    obs.disconnect();
                }
            },
            { threshold: 0.12 }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    return { ref, visible };
}

const StatsBar = () => {
    const [stats, setStats] = useState<Stats>({
        todayDrops: 0,
        trending: 0,
        verifiedThisWeek: 0,
    });
    const [loading, setLoading] = useState(true);
    const sectionInView = useInView();

    const c1 = useCountUp(stats.todayDrops, 1500);
    const c2 = useCountUp(stats.trending, 1800);
    const c3 = useCountUp(stats.verifiedThisWeek, 2000);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const response = await fetch('/api/stats');
                if (response.ok) {
                    const data = await response.json();
                    setStats(data);
                }
            } catch (error) {
                console.error('Failed to fetch stats:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchStats();
        const interval = setInterval(fetchStats, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const statItems = [
        {
            icon: '⬡',
            value: c1.count,
            ref: c1.ref,
            label: "Today's Drops",
            jp: '本日',
            color: '#00d4ff',
        },
        {
            icon: '◈',
            value: c2.count,
            ref: c2.ref,
            label: 'Trending',
            jp: 'トレンド',
            color: '#ff3cac',
        },
        {
            icon: '△',
            value: c3.count,
            ref: c3.ref,
            label: 'Verified This Week',
            jp: '確認済み',
            color: '#7b61ff',
        },
    ];

    return (
        <section
            ref={sectionInView.ref as React.RefObject<HTMLElement>}
            className={styles.statsSection}
        >
            <div className={styles.grid}>
                {statItems.map((stat, i) => (
                    <div
                        key={stat.label}
                        ref={stat.ref}
                        className={`${styles.card} ${sectionInView.visible ? styles.visible : ''}`}
                        style={{
                            '--stat-color': stat.color,
                            '--delay': `${i * 0.12}s`,
                        } as React.CSSProperties}
                    >
                        <span className={styles.cardAccentTop} />
                        <span className={styles.cardAccentLeft} />
                        <div className={styles.cardGlow} />
                        <div className={styles.cardJp}>{stat.jp}</div>
                        <div className={styles.cardContent}>
                            <span className={styles.cardIcon}>{stat.icon}</span>
                            <div className={styles.cardValue}>
                                {loading ? '—' : stat.value.toLocaleString()}
                            </div>
                            <div className={styles.cardLabel}>{stat.label}</div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
};

export default StatsBar;
