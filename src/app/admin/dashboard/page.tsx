import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getAccess } from '@/lib/auth/access';
import WelcomeGate from '@/components/admin/dashboard/WelcomeGate';
import { getScheduleRows, etDayKey, type ScheduleKind } from '@/lib/schedule';
import { fetchOrders } from '@/lib/orders';
import { getTopStories, getComingUp, getWireItems, getNewsPulse, type RadarRow } from '@/lib/discover/queries';
import { getTokenAlerts, type TokenAlert } from '@/lib/dashboard/alerts';
import { WireItem } from '@/components/admin/discover/WireFeed';
import { radarTitle, countdown } from '@/components/admin/discover/format';
import NeedsYou, { type PendingLite } from '@/components/admin/home/NeedsYou';
import TopStories from '@/components/admin/home/TopStories';
import Pic from '@/components/admin/home/Pic';

export const dynamic = 'force-dynamic';

/**
 * Dashboard (2026-10 redesign, approved mock): one calm column on phones.
 *   1. Needs you   yellow strips only when something needs action, else "All clear"
 *   2. Today       the posts going out today, next one highlighted
 *   3. Top stories 1 hero + 2 cards, plain-English headlines (Wire enrichment)
 *   4. Coming up   2x2 poster grid from the Release Radar
 *   5. Latest      4 newest wire rows, then the full Wire
 * Desktop puts 2+3 and 4+5 side by side.
 */

const FORMAT_LABEL: Record<ScheduleKind, string> = { carousel: 'Carousel', video: 'Reel', image: 'Image' };
const HIDDEN_STATUSES = new Set(['declined', 'rejected', 'deleted']);
const TZ = 'America/New_York';

async function fetchToday(canReview: boolean, canStore: boolean) {
    const todayKey = etDayKey(new Date());
    const [rows, pending, orders] = await Promise.all([
        getScheduleRows({ pastHours: 24, futureHours: 24, limit: 60 }),
        canReview
            ? supabaseAdmin.from('posts')
                .select('id, title, image, source_url, youtube_video_id', { count: 'exact' })
                .eq('status', 'pending').order('timestamp', { ascending: false }).limit(8)
            : Promise.resolve({ data: [] as any[], count: 0 }),
        canStore ? fetchOrders(150).catch(() => ({ orders: [] as any[] })) : Promise.resolve({ orders: [] as any[] }),
    ]);
    return {
        scheduled: rows.filter((r) => r.dayKey === todayKey && !HIDDEN_STATUSES.has((r.status || '').toLowerCase())),
        pending: (pending.data || []) as PendingLite[],
        pendingTotal: pending.count ?? 0,
        ordersAwaiting: (orders.orders || []).filter((o: any) => o.stage === 'awaiting').length,
    };
}

function greeting(): string {
    const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }));
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function compact(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return String(n);
}

/** "Ep 2 · 84K members · Crunchyroll" or "Premiere · #1 anticipated · Netflix". */
function posterFacts(r: RadarRow): string {
    const premiere = r.status === 'NOT_YET_RELEASED' || r.next_episode === 1;
    const parts: string[] = [];
    parts.push(premiere ? 'Premiere' : r.next_episode ? `Ep ${r.next_episode}` : 'Airing');
    if (premiere && r.anticipation_rank && r.anticipation_rank <= 10) parts.push(`#${r.anticipation_rank} anticipated`);
    else if (r.popularity) parts.push(`${compact(r.popularity)} members`);
    const stream = (r.streaming || [])[0]?.name;
    if (stream) parts.push(stream);
    return parts.join(' · ');
}

export default async function DashboardPage() {
    const access = await getAccess();
    const canReview = access.isOwner || access.perms.pending;
    const canDiscover = access.isOwner || access.perms.content;
    const canStore = access.isOwner || access.perms.store;
    const firstName = access.name ? access.name.trim().split(/\s+/)[0] : access.isOwner ? 'Jose' : '';
    const showWelcome = access.welcomePending && !!access.name;

    const [today, tokens, stories, comingUp] = await Promise.all([
        fetchToday(canReview, canStore),
        access.isOwner ? getTokenAlerts().catch(() => [] as TokenAlert[]) : Promise.resolve([] as TokenAlert[]),
        canDiscover ? getTopStories(3).catch(() => []) : Promise.resolve([]),
        canDiscover ? getComingUp(4).catch(() => []) : Promise.resolve([]),
    ]);
    const [latest, pulse] = canDiscover
        ? await Promise.all([
            getWireItems({ limit: 6, excludeIds: stories.map((s) => s.id) }).catch(() => []),
            getNewsPulse().catch(() => ({ total: 0, big: 0 })),
        ])
        : [[], { total: 0, big: 0 }];

    const upcoming = today.scheduled.filter((r) => r.isFuture);
    const nextId = upcoming[0]?.id;
    const dateLine = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ });
    const postsLine = upcoming.length
        ? `${upcoming.length} ${upcoming.length === 1 ? 'post' : 'posts'} going out today`
        : today.scheduled.length ? "Today's posts are out" : 'Nothing scheduled today';

    return (
        <div className="ak-home">
            {showWelcome && <WelcomeGate name={access.name!.trim()} />}

            <header className="ak-home-head">
                <div className="ak-home-hello">
                    <h1 className="ak-display">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
                    <p>{dateLine} · {postsLine}</p>
                </div>
                {/* 1. Needs you: a dropdown in the top right */}
                <NeedsYou tokens={tokens} pending={today.pending} pendingTotal={today.pendingTotal} ordersAwaiting={today.ordersAwaiting} />
            </header>

            <div className="ak-home-layout">
                <div className="ak-home-main">
                    {/* News pulse: how much happened in anime since yesterday */}
                    {canDiscover && (
                        <p className="ak-home-pulse">
                            <span className="ak-home-pulse__num">{pulse.total}</span>
                            {pulse.total === 1 ? 'new anime story' : 'new anime stories'} in the last 24 hours
                            {pulse.big > 0 && <> · <strong>{pulse.big} big {pulse.big === 1 ? 'one' : 'ones'}</strong></>}
                            {pulse.total === 0 && ' · a quiet day'}
                        </p>
                    )}

                    <div className="ak-home-row">
                    {/* 3. Top stories */}
                    {canDiscover && stories.length > 0 && (
                        <section className="ak-card ak-home-card">
                            <div className="ak-home-h">
                                <h2>Top stories</h2>
                                <Link href="/admin/discover?tab=wire">All news</Link>
                            </div>
                            <TopStories stories={stories} />
                        </section>
                    )}
                    {/* 5. Latest */}
                    {canDiscover && (
                    <section className="ak-card ak-home-card">
                        <div className="ak-home-h">
                            <h2>Latest</h2>
                            <Link href="/admin/discover?tab=wire">See all</Link>
                        </div>
                        {latest.length === 0
                            ? <p className="ak-home-empty">The wire fills every 30 minutes.</p>
                            : <ul>{latest.map((w) => <WireItem key={w.id} w={w} />)}</ul>}
                    </section>
                    )}
                    {/* 2. Today */}
                    <section className="ak-card ak-home-card ak-home-todaycard">
                        <div className="ak-home-h">
                            <h2>Today</h2>
                            <Link href="/admin/content/schedule">Schedule</Link>
                        </div>
                        {today.scheduled.length === 0 ? (
                            <p className="ak-home-empty">Nothing scheduled today.</p>
                        ) : (
                            <ul className="ak-home-tl">
                                {today.scheduled.map((r) => (
                                    <li key={r.id} className={`ak-home-slot ${r.id === nextId ? 'ak-home-slot--next' : ''} ${r.isFuture ? '' : 'ak-home-slot--past'}`}>
                                        <time>{r.slotLabel}</time>
                                        <Pic srcs={r.cover ? [r.cover] : []} label={r.title} className="ak-home-slot__img" />
                                        <Link href={`/admin/post/${r.id}`} className="ak-home-slot__title">{r.title}</Link>
                                        <span className={`ak-home-fmt ${r.kind === 'video' ? 'ak-home-fmt--reel' : ''}`}>{r.isFuture ? FORMAT_LABEL[r.kind] : 'Posted'}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                    </div>

                    {canDiscover && (
                        <>
                        {/* 4. Coming up */}
                        <section className="ak-card ak-home-card">
                            <div className="ak-home-h">
                                <h2>Coming up</h2>
                                <Link href="/admin/discover?tab=radar">Full radar</Link>
                            </div>
                            {comingUp.length === 0 ? (
                                <p className="ak-home-empty">No big premieres or episodes in the next few days.</p>
                            ) : (
                                <div className="ak-home-posters">
                                    {comingUp.map((r) => {
                                        const cd = countdown(r);
                                        const title = radarTitle(r);
                                        return (
                                            <a key={r.anilist_id} href={r.site_url || '#'} target="_blank" rel="noreferrer" className="ak-home-poster">
                                                <Pic srcs={[r.cover_image, r.banner_image].filter((x): x is string => !!x)} label={title} className="ak-home-poster__img" />
                                                <span className="ak-home-poster__shade" aria-hidden="true" />
                                                <span className={`ak-home-cd ${cd.hot ? 'ak-home-cd--hot' : ''}`}>{cd.label}</span>
                                                <span className="ak-home-poster__text">
                                                    <span className="ak-home-poster__title">{title}</span>
                                                    <span className="ak-home-poster__meta">{posterFacts(r)}</span>
                                                </span>
                                            </a>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                        </>
                    )}
                </div>

            </div>
        </div>
    );
}
