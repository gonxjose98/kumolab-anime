'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import type { AnalyticsData, TopPost } from '@/lib/analytics/dashboard';
import type { ViewPlatform } from '@/lib/analytics/daily-views';

const AXIS = 'rgba(52,70,102,0.85)';
const GRID = 'rgba(125,140,168,0.16)';

// Shown platforms, in tile + stack order. FB and TikTok stay hidden until they pull real views.
const PLATFORMS: { key: ViewPlatform; label: string; color: string }[] = [
    { key: 'threads', label: 'Threads', color: '#24365c' },
    { key: 'instagram', label: 'Instagram', color: '#e0457b' },
    { key: 'website', label: 'Website', color: '#16a3a6' },
    { key: 'x', label: 'X', color: '#9aa3b2' },
];
// Not wired up yet: shown grayed so the full picture is always on screen.
const COMING: { key: string; label: string; note: string }[] = [
    { key: 'facebook', label: 'Facebook', note: 'Paused while we fix reach' },
    { key: 'tiktok', label: 'TikTok', note: 'New account warming up' },
    { key: 'youtube', label: 'YouTube', note: 'Needs a channel connected' },
];
const RANGES = [{ key: '30', label: '30 days' }, { key: '60', label: '60 days' }, { key: '90', label: '90 days' }, { key: 'all', label: 'All time' }];
const CLAIM_LABEL: Record<string, string> = {
    TRAILER_DROP: 'Trailer', NEW_KEY_VISUAL: 'Key Visual', NEW_SEASON_CONFIRMED: 'New Season',
    DATE_ANNOUNCED: 'Release Date', DELAY: 'Delay', CAST_ADDITION: 'Cast', STAFF_UPDATE: 'Staff', OTHER: 'News',
};

const DASH = String.fromCharCode(8212); // empty-value placeholder
const fmt = (n: number | null | undefined) => (n == null ? DASH : n.toLocaleString('en-US'));
const compact = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n);
const pctChange = (cur: number, prev: number | undefined) => (prev && prev > 0 ? ((cur - prev) / prev) * 100 : null);

export default function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
    const { views, ig, threads, topPosts, claimPerf, range } = data;
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [focus, setFocus] = useState<ViewPlatform | null>(null);
    const activeRange = range === 0 ? 'all' : String(range);
    const rangeLabel = range === 0 ? 'all time' : `last ${range} days`;
    const setRange = (key: string) => startTransition(() => router.push(`/admin/analytics?range=${key}`));

    const shown = PLATFORMS.filter((p) => focus === null || p.key === focus);
    const headline = focus ? views.totals[focus] : views.totals.total;
    const headlinePrev = focus ? views.prevTotals?.[focus] : views.prevTotals?.total;
    const headlineDelta = pctChange(headline, headlinePrev);
    const followers: Partial<Record<ViewPlatform, number | null>> = {
        instagram: ig.snapshot.followers, threads: threads.followers,
    };

    return (
        <div className="ak-an flex flex-col gap-5 min-w-0 w-full">
            <div className="ak-an__grid">
                {/* ── Main column: total, platform tiles, chart ── */}
                <div className="flex flex-col gap-5 min-w-0">
                    <div className="ak-card">
                        <div className="ak-an__hero">
                            <div>
                                <div className="ak-overline">{focus ? `${PLATFORMS.find((p) => p.key === focus)?.label} views` : 'Total views'} · {rangeLabel}</div>
                                <div className="ak-an__big">{fmt(headline)}</div>
                                <Delta value={headlineDelta} suffix={range === 0 ? '' : `vs previous ${range} days`} />
                            </div>
                            <div className="ak-an__herotools">
                                <div className={`ak-pills ${pending ? 'ak-pills--busy' : ''}`}>
                                    {RANGES.map((r) => (
                                        <button key={r.key} className={`ak-pill ${activeRange === r.key ? 'ak-pill--active' : ''}`} onClick={() => setRange(r.key)} disabled={pending}>{r.label}</button>
                                    ))}
                                </div>
                                {focus && <button className="ak-an__link" onClick={() => setFocus(null)}>Show all platforms</button>}
                            </div>
                        </div>

                        <div className="ak-an__tiles">
                            {PLATFORMS.map((p) => {
                                const v = views.totals[p.key];
                                const has = views.hasData[p.key];
                                const share = views.totals.total > 0 ? Math.round((v / views.totals.total) * 100) : 0;
                                const active = focus === p.key;
                                return (
                                    <button
                                        key={p.key}
                                        className={`ak-an__tile ${active ? 'ak-an__tile--active' : ''} ${!has ? 'ak-an__tile--off' : ''}`}
                                        onClick={() => has && setFocus(active ? null : p.key)}
                                        disabled={!has}
                                        style={{ ['--tile' as any]: p.color }}
                                    >
                                        <span className="ak-an__tilehead"><i />{p.label}</span>
                                        {has ? (
                                            <>
                                                <span className="ak-an__tilenum">{compact(v)}</span>
                                                <span className="ak-an__tilesub">
                                                    <Delta value={pctChange(v, views.prevTotals?.[p.key])} small />
                                                    <span>{share}% of total</span>
                                                </span>
                                                {followers[p.key] != null && <span className="ak-caption">{fmt(followers[p.key])} followers</span>}
                                            </>
                                        ) : (
                                            <span className="ak-caption" style={{ marginTop: 6 }}>{p.key === 'x' ? 'Waiting on the X API' : 'No data yet'}</span>
                                        )}
                                    </button>
                                );
                            })}
                            {COMING.map((c) => (
                                <div key={c.key} className="ak-an__tile ak-an__tile--off">
                                    <span className="ak-an__tilehead"><i />{c.label}</span>
                                    <span className="ak-caption" style={{ marginTop: 6 }}>{c.note}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="ak-card">
                        <div className="flex items-baseline justify-between mb-3">
                            <span className="ak-overline">Views per day · {rangeLabel}</span>
                            <span className="ak-an__legend">
                                {shown.filter((p) => views.hasData[p.key]).map((p) => (
                                    <span key={p.key}><i style={{ background: p.color }} />{p.label}</span>
                                ))}
                            </span>
                        </div>
                        <ResponsiveContainer width="100%" height={250}>
                            <AreaChart data={views.series} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                                <defs>
                                    {PLATFORMS.map((p) => (
                                        <linearGradient key={p.key} id={`ak-an-${p.key}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={p.color} stopOpacity={0.7} />
                                            <stop offset="100%" stopColor={p.color} stopOpacity={0.18} />
                                        </linearGradient>
                                    ))}
                                </defs>
                                <CartesianGrid stroke={GRID} vertical={false} />
                                <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 11 }} interval={Math.max(0, Math.floor(views.series.length / 10))} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} axisLine={false} width={48} tickFormatter={compact} />
                                <Tooltip {...tooltip} formatter={(v: any, name: any) => [fmt(Number(v)), PLATFORMS.find((p) => p.key === name)?.label || name]} />
                                {shown.filter((p) => views.hasData[p.key]).map((p) => (
                                    <Area key={p.key} type="monotone" dataKey={p.key} stackId="views" stroke={p.color} strokeWidth={2} fill={`url(#ak-an-${p.key})`} />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* ── Side column: glanceable cards ── */}
                <aside className="flex flex-col gap-5 min-w-0">
                    <TopPostsCard posts={topPosts} rangeLabel={rangeLabel} />

                    <div className="ak-card">
                        <div className="ak-overline mb-3">What performs · avg views by type</div>
                        {claimPerf.length === 0 ? <Empty text="No performance data synced yet." /> : (
                            <ResponsiveContainer width="100%" height={Math.max(140, claimPerf.length * 30)}>
                                <BarChart data={claimPerf.map((c) => ({ ...c, name: CLAIM_LABEL[c.claim] || c.claim }))} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                                    <XAxis type="number" hide />
                                    <YAxis type="category" dataKey="name" tick={{ fill: AXIS, fontSize: 11 }} width={84} tickLine={false} axisLine={false} />
                                    <Tooltip {...tooltip} formatter={(v: any) => [fmt(v), 'avg views']} />
                                    <Bar dataKey="avgViews" radius={[0, 5, 5, 0]}>
                                        {claimPerf.map((_, i) => <Cell key={i} fill={i === 0 ? '#d9a441' : '#3a8be0'} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}

function Delta({ value, suffix, small }: { value: number | null; suffix?: string; small?: boolean }) {
    if (value == null) return small ? null : <div className="ak-caption">{suffix ? 'No previous period to compare' : ''}</div>;
    const up = value >= 0;
    const text = `${up ? '▲' : '▼'} ${Math.abs(value).toFixed(Math.abs(value) < 10 ? 1 : 0)}%`;
    if (small) return <span className={up ? 'ak-an__up' : 'ak-an__down'}>{text}</span>;
    return (
        <div className="ak-caption" style={{ marginTop: 4 }}>
            <span className={up ? 'ak-an__up' : 'ak-an__down'} style={{ fontWeight: 700 }}>{text}</span> {suffix}
        </div>
    );
}

function PostRow({ p, i }: { p: TopPost; i: number }) {
    return (
        <a href={`/blog/${p.slug}`} target="_blank" rel="noopener noreferrer" className="ak-an__row" title={`Site ${fmt(p.webViews)} · IG ${fmt(p.ig)} · Threads ${fmt(p.th)}`}>
            <span className="ak-an__rank">{i + 1}</span>
            {p.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={p.image} alt="" />
                : <span className="ak-an__thumb" />}
            <span className="ak-an__rowtitle">{p.title}</span>
            <strong>{compact(p.webViews + p.views)}</strong>
        </a>
    );
}

function TopPostsCard({ posts, rangeLabel }: { posts: TopPost[]; rangeLabel: string }) {
    const [open, setOpen] = useState(false);
    const ranked = [...posts].sort((a, b) => (b.webViews + b.views) - (a.webViews + a.views));
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);
    return (
        <div className="ak-card">
            <div className="flex items-baseline justify-between mb-3">
                <span className="ak-overline">Top posts · {rangeLabel}</span>
                {ranked.length > 3 && <button className="ak-an__link" onClick={() => setOpen(true)}>See all {ranked.length}</button>}
            </div>
            {ranked.length === 0 ? <Empty text="No post metrics in this range yet." /> : (
                <ul className="flex flex-col gap-1.5">
                    {ranked.slice(0, 3).map((p, i) => <li key={p.id}><PostRow p={p} i={i} /></li>)}
                </ul>
            )}
            {open && (
                <div className="ak-an__overlay" onClick={() => setOpen(false)}>
                    <div className="ak-an__popup" role="dialog" aria-label="Top posts" onClick={(e) => e.stopPropagation()}>
                        <div className="ak-an__popuphead">
                            <div>
                                <div className="ak-overline">Top posts</div>
                                <div className="ak-an__popuptitle">{rangeLabel}</div>
                            </div>
                            <button className="ak-an__close" onClick={() => setOpen(false)} aria-label="Close">×</button>
                        </div>
                        <ul className="ak-an__popuplist">
                            {ranked.map((p, i) => <li key={p.id}><PostRow p={p} i={i} /></li>)}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}

function Empty({ text }: { text: string }) {
    return <div className="text-center ak-caption" style={{ padding: '18px 0' }}>{text}</div>;
}

const tooltip = {
    cursor: { stroke: 'rgba(125,140,168,0.35)' },
    contentStyle: {
        background: 'rgba(18,26,44,0.94)', border: '1px solid rgba(196,146,44,0.4)',
        borderRadius: 10, fontSize: 12, color: '#f2f9ff', padding: '6px 10px',
    },
    labelStyle: { color: '#c9d6ea', marginBottom: 2 },
    itemStyle: { color: '#f2f9ff' },
} as const;
