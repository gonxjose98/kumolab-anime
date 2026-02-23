'use client';

import { useEffect, useState } from 'react';
import { Calendar, TrendingUp, ShieldCheck } from 'lucide-react';
import styles from './StatsBar.module.css';

interface Stats {
    todayDrops: number;
    trending: number;
    verifiedThisWeek: number;
}

const StatsBar = () => {
    const [stats, setStats] = useState<Stats>({
        todayDrops: 0,
        trending: 0,
        verifiedThisWeek: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch stats from API
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
        
        // Refresh every 5 minutes
        const interval = setInterval(fetchStats, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const statItems = [
        { 
            icon: Calendar, 
            value: stats.todayDrops, 
            label: "Today's Drops",
            color: '#60A5FA'
        },
        { 
            icon: TrendingUp, 
            value: stats.trending, 
            label: 'Trending',
            color: '#F472B6'
        },
        { 
            icon: ShieldCheck, 
            value: stats.verifiedThisWeek, 
            label: 'Verified This Week',
            color: '#22C55E'
        }
    ];

    return (
        <section className={styles.statsBar}>
            <div className={styles.container}>
                <div className={styles.statsScroll}>
                    {statItems.map((item, index) => (
                        <div 
                            key={index} 
                            className={styles.statItem}
                            style={{ '--stat-color': item.color } as React.CSSProperties}
                        >
                            <div className={styles.statIcon}>
                                <item.icon size={20} />
                            </div>
                            <div className={styles.statContent}>
                                <span className={styles.statValue}>
                                    {loading ? '—' : item.value}
                                </span>
                                <span className={styles.statLabel}>{item.label}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default StatsBar;
