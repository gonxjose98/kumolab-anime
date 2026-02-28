'use client';

import { useEffect, useState, useRef } from 'react';
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
            color5: 'rgba(0,212,255,0.05)',
            color7: 'rgba(0,212,255,0.07)',
            color12: 'rgba(0,212,255,0.12)',
            color20: 'rgba(0,212,255,0.2)',
            color30: 'rgba(0,212,255,0.3)',
            color40: 'rgba(0,212,255,0.4)',
        },
        {
            icon: '◈',
            value: c2.count,
            ref: c2.ref,
            label: 'Trending',
            jp: 'トレンド',
            color: '#ff3cac',
            color5: 'rgba(255,60,172,0.05)',
            color7: 'rgba(255,60,172,0.07)',
            color12: 'rgba(255,60,172,0.12)',
            color20: 'rgba(255,60,172,0.2)',
            color30: 'rgba(255,60,172,0.3)',
            color40: 'rgba(255,60,172,0.4)',
        },
        {
            icon: '△',
            value: c3.count,
            ref: c3.ref,
            label: 'Verified This Week',
            jp: '確認済み',
            color: '#7b61ff',
            color5: 'rgba(123,97,255,0.05)',
            color7: 'rgba(123,97,255,0.07)',
            color12: 'rgba(123,97,255,0.12)',
            color20: 'rgba(123,97,255,0.2)',
            color30: 'rgba(123,97,255,0.3)',
            color40: 'rgba(123,97,255,0.4)',
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
                            '--stat-color-5': stat.color5,
                            '--stat-color-7': stat.color7,
                            '--stat-color-12': stat.color12,
                            '--stat-color-20': stat.color20,
                            '--stat-color-30': stat.color30,
                            '--stat-color-40': stat.color40,
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
