'use client';

import { useState } from 'react';
import type { WireRow } from '@/lib/discover/queries';
import Pic from './Pic';
import { wireHeadline, wireImages, shortSource, ageShort, timeAgo, KIND_CHIP, KIND_LABEL } from '@/components/admin/discover/format';

/** Tap a story to see the original headline and open the article. */
function Original({ w }: { w: WireRow }) {
    return (
        <div className="ak-home-orig">
            {w.plain_title && w.plain_title !== w.title && <p><b>Original headline:</b> {w.title}</p>}
            {w.url && <a href={w.url} target="_blank" rel="noreferrer">Read at {shortSource(w.source_name, w.url) || 'source'} ›</a>}
        </div>
    );
}

export default function TopStories({ stories }: { stories: WireRow[] }) {
    const [open, setOpen] = useState<number | null>(null);
    const [hero, ...rest] = stories;
    if (!hero) return null;
    const toggle = (id: number) => setOpen((o) => (o === id ? null : id));
    const label = (w: WireRow) => w.anime_title || wireHeadline(w);

    return (
        <div className="ak-home-top">
            <div>
                <button className="ak-home-hero" onClick={() => toggle(hero.id)} aria-expanded={open === hero.id}>
                    <Pic srcs={wireImages(hero, true)} label={label(hero)} className="ak-home-hero__img" />
                    <span className="ak-home-hero__shade" aria-hidden="true" />
                    <span className="ak-home-hero__text">
                        <span className={`ak-home-chip ak-home-chip--onimg ${KIND_CHIP[hero.kind] || ''}`}>{KIND_LABEL[hero.kind] || 'News'}</span>
                        <span className="ak-home-hero__title">{wireHeadline(hero)}</span>
                        <span className="ak-home-hero__meta">{hero.source_name}{timeAgo(hero.published_at || hero.detected_at) && ` · ${timeAgo(hero.published_at || hero.detected_at)}`}</span>
                    </span>
                </button>
                {open === hero.id && <Original w={hero} />}
            </div>

            {rest.length > 0 && (
                <div className="ak-home-duo">
                    {rest.map((w) => (
                        <div key={w.id} className="ak-home-mini">
                            <button className="ak-home-mini__btn" onClick={() => toggle(w.id)} aria-expanded={open === w.id}>
                                <Pic srcs={wireImages(w)} label={label(w)} className="ak-home-mini__img" />
                                <span className="ak-home-mini__body">
                                    <span className={`ak-home-chip ${KIND_CHIP[w.kind] || ''}`}>{KIND_LABEL[w.kind] || 'News'}</span>
                                    <span className="ak-home-mini__title">{wireHeadline(w)}</span>
                                    <span className="ak-home-mini__meta">{shortSource(w.source_name, w.url)}{ageShort(w.published_at || w.detected_at) && ` · ${ageShort(w.published_at || w.detected_at)}`}</span>
                                </span>
                            </button>
                            {open === w.id && <Original w={w} />}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
