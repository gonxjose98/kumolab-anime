'use client';

import { useRef } from 'react';
import s from './HomeV3.module.css';

type Item = { rank: number; title: string; image: string | null; line: string; members: string; href: string };

export default function TrendingRow({ items }: { items: Item[] }) {
    const row = useRef<HTMLDivElement>(null);
    const nudge = (dir: number) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.8, behavior: 'smooth' });

    return (
        <div className={s.trendWrap}>
            <button type="button" className={`${s.trendBtn} ${s.trendPrev}`} onClick={() => nudge(-1)} aria-label="Previous">‹</button>
            <div className={s.trendRow} ref={row}>
                {items.map((t) => (
                    <a key={t.rank} href={t.href} target="_blank" rel="noopener noreferrer" className={s.trend}>
                        <div className={s.trendArt}>
                            {t.image && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={t.image} alt="" loading="lazy" />
                            )}
                            <span className={s.rank}>{t.rank}</span>
                        </div>
                        <div className={s.trendBody}>
                            <h3>{t.title}</h3>
                            <p>{t.line}</p>
                            <p className={s.trendMembers}>{t.members}</p>
                        </div>
                    </a>
                ))}
            </div>
            <button type="button" className={`${s.trendBtn} ${s.trendNext}`} onClick={() => nudge(1)} aria-label="Next">›</button>
        </div>
    );
}
