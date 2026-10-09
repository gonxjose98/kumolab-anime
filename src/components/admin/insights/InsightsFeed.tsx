'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    AlertTriangle, BarChart3, CalendarDays, ChevronRight, ExternalLink, Flame, Lightbulb,
    Newspaper, TrendingDown, TrendingUp, Check,
} from 'lucide-react';
import { FEED_TABS, agoText, inTab, type FeedItem, type FeedTab } from '@/lib/explore/feed';

type Tone = 'news' | 'premiere' | 'trending' | 'up' | 'down' | 'ours' | 'system';

const TYPE_META: Record<string, { label: string; tone: Tone; Icon: typeof Newspaper }> = {
    news: { label: 'News', tone: 'news', Icon: Newspaper },
    premiere: { label: 'Premiere', tone: 'premiere', Icon: CalendarDays },
    trending: { label: 'Trending', tone: 'trending', Icon: Flame },
    trend_up: { label: 'Growth', tone: 'up', Icon: TrendingUp },
    trend_down: { label: 'Drop', tone: 'down', Icon: TrendingDown },
    format: { label: 'Our numbers', tone: 'ours', Icon: BarChart3 },
    timing: { label: 'Our numbers', tone: 'ours', Icon: BarChart3 },
    top_post: { label: 'Our numbers', tone: 'ours', Icon: BarChart3 },
    followers: { label: 'Our numbers', tone: 'ours', Icon: BarChart3 },
    system: { label: 'Needs you', tone: 'system', Icon: AlertTriangle },
};

const CONF: Record<string, string> = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };

async function postAction(id: string, action: 'dismiss' | 'act'): Promise<boolean> {
    const res = await fetch('/api/admin/explore/insight', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, action }),
        keepalive: true,
    }).catch(() => null);
    return !!res?.ok;
}

function Row({ item, now, onDismiss }: { item: FeedItem; now: number; onDismiss: (id: string) => void }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [acted, setActed] = useState(item.state === 'acted');
    const meta = TYPE_META[item.type] ?? { label: item.type, tone: 'ours' as Tone, Icon: BarChart3 };
    const world = item.section === 'world';

    async function dismiss() {
        setBusy(true);
        const ok = await postAction(item.id, 'dismiss');
        setBusy(false);
        if (ok) onDismiss(item.id);
    }

    async function makeCarousel() {
        if (!acted) { setActed(true); void postAction(item.id, 'act'); }
        router.push('/admin/studio/images');
    }

    return (
        <article className={`ak-ai-row${item.poster || item.tile ? ' has-visual' : ''}${acted ? ' is-acted' : ''}`}>
            {item.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="ak-ai-row__poster" src={item.poster} alt="" loading="lazy" referrerPolicy="no-referrer" />
            ) : item.tile ? (
                <div className={`ak-ai-row__tile is-${item.tile.tone}`} aria-hidden="true">
                    <span className="ak-ai-row__tilenum">{item.tile.text}</span>
                    <span className="ak-ai-row__tilesub">{item.tile.sub}</span>
                </div>
            ) : null}

            <div className="ak-ai-row__main">
                <div className="ak-ai-row__meta">
                    <span className={`ak-ai-chip is-${meta.tone}`}><meta.Icon size={13} aria-hidden="true" />{meta.label}</span>
                    <span className="ak-ai-chip is-plain">{CONF[item.confidence] ?? item.confidence}</span>
                    {acted && <span className="ak-ai-chip is-done"><Check size={12} aria-hidden="true" />Started</span>}
                    <span className="ak-ai-row__ago">{agoText(item.created_at, now)}</span>
                </div>

                <h3 className="ak-ai-row__title">{item.title}</h3>
                <p className="ak-ai-row__why">{item.why}</p>

                {item.recommendation && (
                    <p className="ak-ai-idea"><Lightbulb size={14} aria-hidden="true" /><span><strong>Idea:</strong> {item.recommendation}</span></p>
                )}

                {open && (
                    <div className="ak-ai-row__more">
                        {item.details && <p>{item.details}</p>}
                        <ul className="ak-ai-src">
                            {item.sources.map((s) => (
                                <li key={s.ref}>
                                    {s.url
                                        ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}<ExternalLink size={11} aria-hidden="true" /></a>
                                        : <span className="ak-ai-src__label">{s.label}</span>}
                                    <span className="ak-ai-src__text">{s.text}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="ak-ai-row__actions">
                    {world ? (
                        <button type="button" className="ak-ai-act is-primary" onClick={makeCarousel}>Make a carousel<ChevronRight size={14} aria-hidden="true" /></button>
                    ) : (
                        <button type="button" className="ak-ai-act is-primary" onClick={() => router.push('/admin/analytics')}>Open analytics<ChevronRight size={14} aria-hidden="true" /></button>
                    )}
                    <button type="button" className="ak-ai-act" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                        {open ? 'Hide sources' : item.sources.length > 1 ? 'View sources' : 'View source'}
                        <ChevronRight size={14} className={`ak-ai-act__chev${open ? ' is-open' : ''}`} aria-hidden="true" />
                    </button>
                    <button type="button" className="ak-ai-act is-quiet" onClick={dismiss} disabled={busy}>{busy ? 'Dismissing' : 'Dismiss'}</button>
                </div>
            </div>
        </article>
    );
}

export default function InsightsFeed({ items, now, empty, footnote }: { items: FeedItem[]; now: number; empty: { title: string; line: string }; footnote?: string | null }) {
    const [tab, setTab] = useState<FeedTab>('all');
    const [gone, setGone] = useState<Set<string>>(new Set());
    const live = useMemo(() => items.filter((i) => !gone.has(i.id)), [items, gone]);
    const shown = live.filter((i) => inTab(i, tab));
    const counts = Object.fromEntries(FEED_TABS.map((t) => [t.key, live.filter((i) => inTab(i, t.key)).length])) as Record<FeedTab, number>;

    return (
        <div className="ak-ai-feedwrap">
            <section className="ak-ai-feed" aria-label="Insights">
                <div className="ak-ai-feed__bar">
                    <div className="ak-ai-tabs" role="tablist" aria-label="Filter insights">
                        {FEED_TABS.map((t) => (
                            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key}
                                className={`ak-ai-tab${tab === t.key ? ' is-active' : ''}`} onClick={() => setTab(t.key)}>
                                {t.label}
                                {t.key !== 'all' && counts[t.key] > 0 && <span className="ak-ai-tab__n">{counts[t.key]}</span>}
                            </button>
                        ))}
                    </div>
                </div>
                {shown.length === 0 ? (
                    <div className="ak-ai-empty">
                        <strong>{live.length === 0 ? empty.title : 'Nothing here right now'}</strong>
                        <span>{live.length === 0 ? empty.line : 'Try another filter.'}</span>
                    </div>
                ) : (
                    shown.map((i) => <Row key={i.id} item={i} now={now} onDismiss={(id) => setGone((s) => new Set(s).add(id))} />)
                )}
                {footnote && <p className="ak-ai-feed__foot">{footnote}</p>}
            </section>
        </div>
    );
}
