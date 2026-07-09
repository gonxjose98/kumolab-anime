'use client';

import { useState, useTransition, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import {
    ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';
import { ChevronDown } from 'lucide-react';
import type { AnalyticsData, TopPost } from '@/lib/analytics/dashboard';
import SyncMetricsButton from './SyncMetricsButton';

const GOLD = '#d9a441';
const BLUE = '#3a8be0';
const GREEN = '#35a877';
const AXIS = 'rgba(125,140,168,0.7)';
const GRID = 'rgba(125,140,168,0.18)';

const CLAIM_LABEL: Record<string, string> = {
    TRAILER_DROP: 'Trailer', NEW_KEY_VISUAL: 'Key Visual', NEW_SEASON_CONFIRMED: 'New Season',
    DATE_ANNOUNCED: 'Release Date', DELAY: 'Delay', CAST_ADDITION: 'Cast', STAFF_UPDATE: 'Staff', OTHER: 'News',
};
const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US'));
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
const money = (n: number, ccy: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy || 'USD' }).format(n || 0);

type PlatformKey = 'all' | 'website' | 'instagram' | 'facebook' | 'threads';
const PLATFORMS: { key: PlatformKey; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'website', label: 'Website' },
    { key: 'instagram', label: 'Instagram' },
    { key: 'facebook', label: 'Facebook' },
    { key: 'threads', label: 'Threads' },
];
const RANGES: { key: string; label: string }[] = [
    { key: '7', label: '7d' }, { key: '30', label: '30d' }, { key: '60', label: '60d' }, { key: '90', label: '90d' }, { key: 'all', label: 'All' },
];

export default function AnalyticsDashboard({ data }: { data: AnalyticsData }) {
    const { ig, fb, threads, web, viewsSeries, pipeline, topPosts, claimPerf, revenue, range } = data;
    const snap = ig.snapshot;
    const igEngRate = snap.totalInteractions28d && snap.reach28d
        ? `${((snap.totalInteractions28d / snap.reach28d) * 100).toFixed(1)}%` : '—';

    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [platform, setPlatform] = useState<PlatformKey>('all');
    const activeRange = range === 0 ? 'all' : String(range);
    const rangeLabel = range === 0 ? 'all time' : `last ${range} days`;
    const setRange = (key: string) => startTransition(() => router.push(`/admin/analytics?range=${key}`));

    const show = {
        all: platform === 'all',
        ig: platform === 'all' || platform === 'instagram',
        fb: platform === 'all' || platform === 'facebook',
        threads: platform === 'all' || platform === 'threads',
        website: platform === 'all' || platform === 'website',
        revenue: platform === 'all',
        avgType: platform === 'all',
        igRecent: platform === 'all' || platform === 'instagram',
    };
    const anyCard = show.ig || show.fb || show.threads;

    return (
        <div className="max-w-6xl mx-auto flex flex-col gap-6">
            {/* Controls: platform filter · time range · sync */}
            <div className="ak-anctrl">
                <div className="ak-pills" style={{ flexWrap: 'wrap' }}>
                    {PLATFORMS.map((p) => (
                        <button key={p.key} className={`ak-pill ${platform === p.key ? 'ak-pill--active' : ''}`} onClick={() => setPlatform(p.key)}>{p.label}</button>
                    ))}
                </div>
                <div className="ak-anctrl__right">
                    <div className={`ak-pills ${pending ? 'ak-pills--busy' : ''}`} style={{ flexWrap: 'wrap' }}>
                        {RANGES.map((r) => (
                            <button key={r.key} className={`ak-pill ${activeRange === r.key ? 'ak-pill--active' : ''}`} onClick={() => setRange(r.key)} disabled={pending}>{r.label}</button>
                        ))}
                    </div>
                    <SyncMetricsButton />
                </div>
            </div>

            {/* Per-platform snapshot cards */}
            {anyCard && (
                <div className={show.all ? 'grid grid-cols-1 md:grid-cols-3 gap-3' : 'grid grid-cols-1 gap-3'}>
                    {show.ig && <PlatformCard name="Instagram" ok={snap.ok} reason={snap.reason} followers={snap.followers} views={snap.views28d} eng={igEngRate} engLabel="Eng. rate" />}
                    {show.fb && <PlatformCard name="Facebook" ok={fb.ok} reason={fb.reason} followers={fb.followers} views={fb.views28d} eng={fmt(fb.engagement28d)} engLabel="Engagements" />}
                    {show.threads && <PlatformCard name="Threads" ok={threads.ok} reason={threads.reason} followers={threads.followers} views={threads.views28d} eng={fmt(threads.engagement28d)} engLabel="Engagements" />}
                </div>
            )}

            {/* Reach + site views KPIs */}
            {show.all && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Kpi label="IG reach · 28d" value={fmt(snap.reach28d)} />
                    <Kpi label="Posts published" value={fmt(data.postedTotal)} />
                    <Kpi label="Site views · 30d" value={web.ok ? fmt(web.views30d) : '—'} />
                    <Kpi label="Site views · 7d" value={web.ok ? fmt(web.views7d) : '—'} />
                </div>
            )}

            {/* Website traffic trend */}
            {show.website && (
                <div className="ak-card">
                    <div className="flex items-baseline justify-between mb-3">
                        <span className="ak-overline">Website views · {rangeLabel}</span>
                        <span className="ak-caption">{web.ok ? `${fmt(web.botViews30d)} bots filtered` : ''}</span>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={viewsSeries} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
                            <defs>
                                <linearGradient id="ak-v" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={BLUE} stopOpacity={0.5} />
                                    <stop offset="100%" stopColor={BLUE} stopOpacity={0.04} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid stroke={GRID} vertical={false} />
                            <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 10 }} interval={Math.max(1, Math.floor(viewsSeries.length / 8))} tickLine={false} axisLine={false} />
                            <YAxis tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={false} width={40} />
                            <Tooltip {...tooltip} />
                            <Area type="monotone" dataKey="views" stroke={BLUE} strokeWidth={2} fill="url(#ak-v)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Revenue */}
            {show.revenue && (
                <div className="ak-card">
                    <div className="flex items-baseline justify-between mb-3">
                        <span className="ak-overline">Revenue · {rangeLabel}</span>
                        <span className="ak-caption">{revenue.ok ? 'live from Printful orders' : 'store not connected'}</span>
                    </div>
                    {revenue.orders === 0 ? (
                        <Empty text={revenue.ok
                            ? 'No orders yet. Revenue and order trends appear here the moment the store starts taking payments.'
                            : 'Store not connected yet.'} />
                    ) : (
                        <>
                            <div className="grid grid-cols-3 gap-3 mb-4">
                                <Kpi label="Revenue" value={money(revenue.total, revenue.currency)} />
                                <Kpi label="Orders" value={fmt(revenue.orders)} />
                                <Kpi label="Avg order" value={money(revenue.aov, revenue.currency)} />
                            </div>
                            <ResponsiveContainer width="100%" height={160}>
                                <BarChart data={revenue.series} margin={{ top: 4, right: 6, left: -12, bottom: 0 }}>
                                    <CartesianGrid stroke={GRID} vertical={false} />
                                    <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 10 }} interval={Math.max(1, Math.floor(revenue.series.length / 8))} tickLine={false} axisLine={false} />
                                    <YAxis tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={false} width={48} tickFormatter={(v: any) => money(Number(v), revenue.currency)} />
                                    <Tooltip {...tooltip} formatter={(v: any) => [money(Number(v), revenue.currency), 'revenue']} />
                                    <Bar dataKey="amount" fill={GREEN} radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </>
                    )}
                </div>
            )}

            {/* Top performing posts */}
            <TopPostsCard posts={topPosts} platform={platform} rangeLabel={rangeLabel} />

            {/* Content that performs + IG top recent */}
            {(show.avgType || show.igRecent) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {show.avgType && (
                        <div className="ak-card">
                            <div className="ak-overline mb-3">Which content performs · avg views by type</div>
                            {claimPerf.length === 0 ? <Empty text="No performance data synced yet." /> : (
                                <ResponsiveContainer width="100%" height={Math.max(160, claimPerf.length * 34)}>
                                    <BarChart data={claimPerf.map((c) => ({ ...c, name: CLAIM_LABEL[c.claim] || c.claim }))} layout="vertical" margin={{ top: 0, right: 12, left: 6, bottom: 0 }}>
                                        <CartesianGrid stroke={GRID} horizontal={false} />
                                        <XAxis type="number" tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={compact} />
                                        <YAxis type="category" dataKey="name" tick={{ fill: AXIS, fontSize: 11 }} width={78} tickLine={false} axisLine={false} />
                                        <Tooltip {...tooltip} formatter={(v: any) => [fmt(v), 'avg views']} />
                                        <Bar dataKey="avgViews" radius={[0, 5, 5, 0]}>
                                            {claimPerf.map((_, i) => <Cell key={i} fill={i === 0 ? GOLD : BLUE} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    )}

                    {show.igRecent && (
                        <div className="ak-card">
                            <div className="flex items-baseline justify-between mb-3">
                                <span className="ak-overline">Instagram · top recent</span>
                                {!snap.ok && <span className="ak-caption" style={{ color: 'var(--sun)' }}>IG not connected</span>}
                            </div>
                            {ig.topRecent.length === 0 ? <Empty text={snap.reason || 'No recent posts to score.'} /> : (
                                <ul className="flex flex-col gap-2">
                                    {ig.topRecent.slice(0, 6).map((m) => (
                                        <li key={m.id} className="ak-uprow" style={{ padding: '8px 10px' }}>
                                            {m.thumbnail ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={m.thumbnail} alt="" className="w-10 h-10 rounded object-cover shrink-0" style={{ border: '1px solid var(--line)' }} />
                                            ) : <div className="w-10 h-10 rounded shrink-0" style={{ background: 'var(--surface-2)' }} />}
                                            <a href={m.permalink} target="_blank" rel="noopener noreferrer" className="ak-body-sm truncate flex-1 hover:underline" style={{ color: 'var(--ink)' }}>
                                                {m.caption || '(no caption)'}
                                            </a>
                                            <span className="ak-body-sm shrink-0" style={{ fontWeight: 700, color: 'var(--ink)' }}>{compact(m.views)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Pipeline + website sources (secondary, collapsible) */}
            {show.all && (
                <details className="ak-card ak-card--flush">
                    <summary className="flex items-center justify-between p-5 cursor-pointer list-none">
                        <span className="ak-overline">Pipeline &amp; sources</span>
                        <span className="ak-caption">Show</span>
                    </summary>
                    <div className="p-5 pt-0 grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div>
                            <div className="ak-overline mb-3">Posts published · daily</div>
                            {pipeline.length === 0 ? <Empty text="No pipeline history." /> : (
                                <ResponsiveContainer width="100%" height={150}>
                                    <BarChart data={pipeline} margin={{ top: 4, right: 6, left: -20, bottom: 0 }}>
                                        <CartesianGrid stroke={GRID} vertical={false} />
                                        <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 10 }} interval={4} tickLine={false} axisLine={false} />
                                        <YAxis tick={{ fill: AXIS, fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
                                        <Tooltip {...tooltip} />
                                        <Bar dataKey="published" fill={GOLD} radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                        <div>
                            <div className="ak-overline mb-3">Top sources</div>
                            {web.ok && web.topReferrers.length > 0 ? (
                                <ul className="flex flex-col gap-2">
                                    {web.topReferrers.map((r) => (
                                        <TrafficBar key={r.label} row={r} max={web.topReferrers[0].views} />
                                    ))}
                                </ul>
                            ) : <Empty text="No referrers yet — traffic is mostly direct." />}
                        </div>
                    </div>
                </details>
            )}
        </div>
    );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="ak-stat">
            <div className="ak-overline">{label}</div>
            <div className="ak-stat__num">{value}</div>
            {sub && <div className="ak-caption">{sub}</div>}
        </div>
    );
}

function PlatformCard({ name, ok, reason, followers, views, eng, engLabel }: {
    name: string; ok: boolean; reason?: string;
    followers: number | null; views: number | null; eng: string; engLabel: string;
}) {
    return (
        <div className="ak-card">
            <div className="flex items-baseline justify-between mb-3">
                <span className="ak-overline">{name}</span>
                {!ok && <span className="ak-caption" title={reason} style={{ color: 'var(--sun)' }}>not connected</span>}
            </div>
            <div className="grid grid-cols-3 gap-2">
                <MiniStat label="Followers" value={fmt(followers)} />
                <MiniStat label="Views · 28d" value={fmt(views)} />
                <MiniStat label={engLabel} value={eng} />
            </div>
        </div>
    );
}

function MiniStat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div style={{ fontFamily: 'var(--ak-display)', fontWeight: 800, fontSize: '1.15rem', lineHeight: 1.1, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
            <div className="ak-caption" style={{ marginTop: 2 }}>{label}</div>
        </div>
    );
}

// Which per-post metric a platform filter ranks + shows in the Social column.
const PLATFORM_KEY: Record<PlatformKey, keyof Pick<TopPost, 'webViews' | 'ig' | 'fb' | 'th'>> = {
    all: 'webViews', website: 'webViews', instagram: 'ig', facebook: 'fb', threads: 'th',
};

function TopPostsCard({ posts, platform, rangeLabel }: { posts: TopPost[]; platform: PlatformKey; rangeLabel: string }) {
    const [sort, setSort] = useState<'webViews' | 'engagement'>('webViews');
    const [openId, setOpenId] = useState<string | null>(null);

    // For a specific platform, rank by that platform's views. For 'all', keep the toggle.
    const sortKey: 'webViews' | 'engagement' | 'ig' | 'fb' | 'th' =
        platform === 'all' ? sort : PLATFORM_KEY[platform];
    const sorted = [...posts].sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number));

    const socialVal = (p: TopPost): number =>
        platform === 'instagram' ? p.ig : platform === 'facebook' ? p.fb : platform === 'threads' ? p.th : p.views;
    const socialLabel = platform === 'instagram' ? 'IG views' : platform === 'facebook' ? 'FB views' : platform === 'threads' ? 'Threads' : 'Social';

    return (
        <div className="ak-card ak-card--flush">
            <div className="flex items-center justify-between gap-3 p-5 pb-3">
                <span className="ak-overline">Top posts · {rangeLabel}</span>
                {platform === 'all' && (
                    <div className="ak-pills">
                        <button className={`ak-pill ${sort === 'webViews' ? 'ak-pill--active' : ''}`} onClick={() => setSort('webViews')}>Site views</button>
                        <button className={`ak-pill ${sort === 'engagement' ? 'ak-pill--active' : ''}`} onClick={() => setSort('engagement')}>Engagement</button>
                    </div>
                )}
            </div>
            {sorted.length === 0 ? (
                <div className="px-5 pb-5"><Empty text="No post metrics in this range yet. Metrics populate as published posts are synced." /></div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table className="ak-table">
                        <thead>
                            <tr>
                                <th style={{ width: 34 }}>#</th>
                                <th>Post</th>
                                <th>Type</th>
                                <th style={{ textAlign: 'right' }}>Site views</th>
                                <th style={{ textAlign: 'right' }}>{socialLabel}</th>
                                <th style={{ width: 90 }}>Platforms</th>
                                <th style={{ width: 34 }} />
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.slice(0, 20).map((p, i) => {
                                const open = openId === p.id;
                                const sv = socialVal(p);
                                return (
                                    <Fragment key={p.id}>
                                        <tr className={open ? 'ak-trow--open' : ''} style={{ cursor: 'pointer' }} onClick={() => setOpenId(open ? null : p.id)}>
                                            <td style={{ color: 'var(--ink-3)', fontWeight: 700 }}>{i + 1}</td>
                                            <td>
                                                <a href={`/blog/${p.slug}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="hover:underline" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                                                    {p.title}
                                                </a>
                                                <div className="ak-caption">{p.source || ''}{p.publishedAt ? ` · ${new Date(p.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</div>
                                            </td>
                                            <td><span className="ak-caption" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>{p.claim ? (CLAIM_LABEL[p.claim] || 'News') : '—'}</span></td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{compact(p.webViews)}</td>
                                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-2)' }}>{sv > 0 ? compact(sv) : '—'}</td>
                                            <td>
                                                <span className="ak-caption" style={{ display: 'inline-flex', gap: 6 }}>
                                                    {p.ig > 0 && <span title={`Instagram ${fmt(p.ig)}`}>IG</span>}
                                                    {p.fb > 0 && <span title={`Facebook ${fmt(p.fb)}`}>FB</span>}
                                                    {p.th > 0 && <span title={`Threads ${fmt(p.th)}`}>TH</span>}
                                                    {p.tw > 0 && <span title={`X ${fmt(p.tw)}`}>X</span>}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <ChevronDown size={15} style={{ color: 'var(--ink-3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                                            </td>
                                        </tr>
                                        {open && (
                                            <tr className="ak-trow-detail">
                                                <td colSpan={7}>
                                                    <div className="ak-postdetail">
                                                        <DetailStat label="Website" views={p.webViews} />
                                                        {p.platforms.instagram && <DetailStat label="Instagram" {...p.platforms.instagram} />}
                                                        {p.platforms.facebook && <DetailStat label="Facebook" {...p.platforms.facebook} />}
                                                        {p.platforms.threads && <DetailStat label="Threads" {...p.platforms.threads} />}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function DetailStat({ label, views, likes, comments }: { label: string; views: number; likes?: number; comments?: number }) {
    return (
        <div className="ak-postdetail__col">
            <div className="ak-postdetail__plat">{label}</div>
            <div className="ak-postdetail__row"><span>Views</span><strong>{fmt(views)}</strong></div>
            {likes != null && <div className="ak-postdetail__row"><span>Likes</span><strong>{fmt(likes)}</strong></div>}
            {comments != null && <div className="ak-postdetail__row"><span>Comments</span><strong>{fmt(comments)}</strong></div>}
        </div>
    );
}

function TrafficBar({ row, max }: { row: { label: string; views: number }; max: number }) {
    const pct = max > 0 ? Math.max(4, Math.round((row.views / max) * 100)) : 0;
    return (
        <li className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
                <span className="ak-body-sm truncate">{row.label}</span>
                <span className="ak-body-sm shrink-0" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>{fmt(row.views)}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--gold)', opacity: 0.9 }} />
            </div>
        </li>
    );
}

function Empty({ text }: { text: string }) {
    return <div className="text-center ak-caption" style={{ padding: '20px 0' }}>{text}</div>;
}

const tooltip = {
    cursor: { fill: 'rgba(125,140,168,0.12)' },
    contentStyle: {
        background: 'rgba(18,26,44,0.94)', border: '1px solid rgba(196,146,44,0.4)',
        borderRadius: 10, fontSize: 12, color: '#f2f9ff', padding: '6px 10px',
    },
    labelStyle: { color: '#c9d6ea', marginBottom: 2 },
} as const;
