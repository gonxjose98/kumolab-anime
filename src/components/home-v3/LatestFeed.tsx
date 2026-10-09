'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BlogPost } from '@/types';
import s from './HomeV3.module.css';
import p from './Pages.module.css';

const PAGE = 16;
const FILTERS: { key: string; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'DROP', label: 'Daily drops' },
    { key: 'INTEL', label: 'News' },
    { key: 'TRENDING', label: 'Trending' },
    { key: 'COMMUNITY', label: 'Community' },
];
const TONE: Record<string, { label: string; tone: string }> = {
    DROP: { label: 'Daily drop', tone: 'blue' },
    INTEL: { label: 'News', tone: 'green' },
    TRENDING: { label: 'Trending', tone: 'gold' },
    COMMUNITY: { label: 'Community', tone: 'sky' },
};

function ago(iso?: string) {
    if (!iso) return '';
    const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
}

const img = (post: BlogPost) => (post.youtube_video_id ? `https://img.youtube.com/vi/${post.youtube_video_id}/hqdefault.jpg` : post.image);

export default function LatestFeed({ posts }: { posts: BlogPost[] }) {
    const [filter, setFilter] = useState('ALL');
    const [q, setQ] = useState('');
    const [count, setCount] = useState(PAGE);

    const list = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return posts.filter((post) => post.isPublished
            && (filter === 'ALL' || post.type === filter)
            && (!needle || post.title.toLowerCase().includes(needle) || (post.excerpt || '').toLowerCase().includes(needle)));
    }, [posts, filter, q]);
    const shown = list.slice(0, count);

    return (
        <>
            <div className={p.controls}>
                <div className={p.chips} role="group" aria-label="Filter">
                    {FILTERS.map((f) => (
                        <button key={f.key} type="button" className={`${p.chip} ${filter === f.key ? p.chipOn : ''}`} onClick={() => { setFilter(f.key); setCount(PAGE); }}>
                            {f.label}
                        </button>
                    ))}
                </div>
                <input className={p.search} type="search" value={q} onChange={(e) => { setQ(e.target.value); setCount(PAGE); }} placeholder="Search anime news…" aria-label="Search" />
            </div>

            {shown.length === 0 ? (
                <p className={p.empty}>Nothing matches that yet. Try another word.</p>
            ) : (
                <div className={p.grid4}>
                    {shown.map((post) => {
                        const t = TONE[post.type] || { label: 'News', tone: 'green' };
                        const src = img(post);
                        return (
                            <Link key={post.slug} href={`/blog/${post.slug}`} className={s.drop}>
                                {src && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={src} alt="" loading="lazy" className={s.dropImg} />
                                )}
                                <div className={s.dropBody}>
                                    <div className={s.dropMeta}><span className={`${s.chip} ${s[`tone_${t.tone}`]}`}>{t.label}</span><span>{ago(post.published_at || post.timestamp)}</span></div>
                                    <h3 className={s.dropTitle}>{post.title}</h3>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
            {shown.length < list.length && (
                <button type="button" className={p.more} onClick={() => setCount((c) => c + PAGE)}>Show more</button>
            )}
        </>
    );
}
