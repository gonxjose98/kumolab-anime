'use client';

import { useCountUp, useInView } from './motion';
import styles from './ReachBar.module.css';

const STATS = [
    { end: 360000, suffix: '+', label: 'Anime fans reached monthly', jp: '月間リーチ' },
    { end: 4200000, suffix: '+', label: 'Views across platforms', jp: '総再生数' },
    { end: 900, suffix: '+', label: 'Verified drops published', jp: '確認済み' },
    { end: 5, suffix: '', label: 'Platforms, one feed', jp: 'プラットフォーム' },
];

function format(value: number, end: number): string {
    if (end >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
    if (end >= 1_000) return Math.round(value / 1_000) + 'K';
    return String(Math.round(value));
}

function Stat({
    end,
    suffix,
    label,
    jp,
    start,
    index,
}: {
    end: number;
    suffix: string;
    label: string;
    jp: string;
    start: boolean;
    index: number;
}) {
    const value = useCountUp(end, start, 1800 + index * 250);
    return (
        <div
            className={`${styles.stat} ${start ? styles.statVisible : ''}`}
            style={{ '--delay': `${index * 0.12}s` } as React.CSSProperties}
        >
            <div className={styles.statValue}>
                {format(value, end)}
                <span className={styles.statSuffix}>{suffix}</span>
            </div>
            <div className={styles.statLabel}>{label}</div>
            <div className={styles.statJp}>{jp}</div>
        </div>
    );
}

const ReachBar = () => {
    const { ref, visible } = useInView<HTMLElement>(0.3);

    return (
        <section ref={ref} className={styles.section}>
            <p className={`${styles.statement} ${visible ? styles.statementVisible : ''}`}>
                Trusted by <em>360K+ anime fans</em> every month
            </p>
            <div className={styles.grid}>
                {STATS.map((s, i) => (
                    <Stat key={s.label} {...s} start={visible} index={i} />
                ))}
            </div>
        </section>
    );
};

export default ReachBar;
