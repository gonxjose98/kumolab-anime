import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import PendingReviewActions from '@/components/admin/dashboard/PendingReviewActions';
import PendingPreview from '@/components/admin/dashboard/PendingPreview';
import { getAccess } from '@/lib/auth/access';
import WelcomeGate from '@/components/admin/dashboard/WelcomeGate';
import { getScheduleRows, etDayKey, type ScheduleKind } from '@/lib/schedule';
import { fetchOrders } from '@/lib/orders';
import { getNextBigPremieres, getWireItems } from '@/lib/discover/queries';
import { RadarItem } from '@/components/admin/discover/RadarList';
import { WireItem } from '@/components/admin/discover/WireFeed';

export const dynamic = 'force-dynamic';

/**
 * Dashboard = exactly three calm blocks: Today, Radar, Wire.
 * (System health, source health, social pulse, stat tiles and the activity log
 * moved off the dashboard in the 2026-10 trim; their components live on in
 * components/admin/dashboard/LegacyCards.tsx for the Explore tab.)
 */

const FORMAT_LABEL: Record<ScheduleKind, string> = { carousel: 'Carousel', video: 'Reel', image: 'Image' };
const HIDDEN_STATUSES = new Set(['declined', 'rejected', 'deleted']);

async function fetchToday(canReview: boolean) {
    const todayKey = etDayKey(new Date());
    const [rows, pending, orders] = await Promise.all([
        getScheduleRows({ pastHours: 24, futureHours: 24, limit: 60 }),
        canReview
            ? supabaseAdmin.from('posts')
                .select('id, title, image, source, source_url, youtube_video_id', { count: 'exact' })
                .eq('status', 'pending').order('timestamp', { ascending: false }).limit(5)
            : Promise.resolve({ data: [] as any[], count: 0 }),
        fetchOrders(150).catch(() => ({ orders: [] as any[] })),
    ]);
    return {
        scheduled: rows.filter((r) => r.dayKey === todayKey && !HIDDEN_STATUSES.has((r.status || '').toLowerCase())),
        pending: (pending.data || []) as any[],
        pendingTotal: pending.count ?? 0,
        ordersAwaiting: (orders.orders || []).filter((o: any) => o.stage === 'awaiting').length,
    };
}

export default async function DashboardPage() {
    const access = await getAccess();
    const canReview = access.isOwner || access.perms.pending;
    const canDiscover = access.isOwner || access.perms.content;
    const firstName = access.name ? access.name.trim().split(/\s+/)[0] : '';
    const showWelcome = access.welcomePending && !!access.name;

    const [today, premieres, wire] = await Promise.all([
        fetchToday(canReview),
        canDiscover ? getNextBigPremieres(5) : Promise.resolve([]),
        canDiscover ? getWireItems({ limit: 8 }) : Promise.resolve([]),
    ]);

    return (
        <div className="flex flex-col gap-5 min-w-0">
            {showWelcome && <WelcomeGate name={access.name!.trim()} />}
            <div className="ak-display" style={{ fontSize: 22 }}>{firstName ? `Welcome back, ${firstName}` : 'Welcome back'}</div>

            {/* ── 1. Today ─────────────────────────────────────────── */}
            <section className="ak-card ak-card--flush">
                <div className="ak-dash3__head">
                    <span className="ak-title">Today</span>
                    <Link href="/admin/content/schedule" className="ak-dash3__link">Schedule →</Link>
                </div>

                {today.ordersAwaiting > 0 && (
                    <Link href="/admin/store/orders" className="ak-dash3__orders">
                        {today.ordersAwaiting} paid {today.ordersAwaiting === 1 ? 'order' : 'orders'} awaiting your approval →
                    </Link>
                )}

                {today.scheduled.length === 0 ? (
                    <div className="ak-dash3__empty">Nothing scheduled today.</div>
                ) : (
                    <ul style={{ marginTop: 6 }}>
                        {today.scheduled.map((r) => (
                            <li key={r.id} className="ak-dash3__line" style={r.isFuture ? undefined : { opacity: 0.55 }}>
                                <span className="ak-dash3__time">{r.slotLabel}</span>
                                <Link href={`/admin/post/${r.id}`} className="ak-dash3__title">{r.title}</Link>
                                <span className="ak-dash3__fmt">{r.isFuture ? FORMAT_LABEL[r.kind] : 'Posted'}</span>
                            </li>
                        ))}
                    </ul>
                )}

                {canReview && today.pending.length > 0 && (
                    <>
                        <div className="ak-dash3__sub">Needs approval · {today.pendingTotal}</div>
                        <ul>
                            {today.pending.map((p) => (
                                <li key={p.id} className="ak-dash3__review">
                                    <PendingPreview image={p.image} youtubeId={p.youtube_video_id} sourceUrl={p.source_url} title={p.title} />
                                    <Link href={`/admin/post/${p.id}`} className="ak-dash3__title">{p.title}</Link>
                                    <div className="ml-auto shrink-0">
                                        <PendingReviewActions
                                            postId={p.id}
                                            originalFormat={(p.youtube_video_id || /youtube\.com|youtu\.be/.test(p.source_url || '')) ? 'reel' : 'landscape'}
                                        />
                                    </div>
                                </li>
                            ))}
                        </ul>
                        {today.pendingTotal > today.pending.length && (
                            <Link href="/admin/content/posts" className="ak-dash3__link" style={{ display: 'block', padding: '10px 16px 14px' }}>
                                All {today.pendingTotal} pending →
                            </Link>
                        )}
                    </>
                )}
                <div style={{ height: 8 }} />
            </section>

            {canDiscover && (
                <>
                    {/* ── 2. Radar ─────────────────────────────────── */}
                    <section className="ak-card ak-card--flush">
                        <div className="ak-dash3__head">
                            <span className="ak-title">Radar · next big premieres</span>
                            <Link href="/admin/discover?tab=radar" className="ak-dash3__link">Full Radar →</Link>
                        </div>
                        {premieres.length === 0
                            ? <div className="ak-dash3__empty">No big premieres in the next 60 days.</div>
                            : <ul>{premieres.map((r) => <RadarItem key={r.anilist_id} r={r} compact />)}</ul>}
                    </section>

                    {/* ── 3. Wire ──────────────────────────────────── */}
                    <section className="ak-card ak-card--flush">
                        <div className="ak-dash3__head">
                            <span className="ak-title">Wire · latest</span>
                            <Link href="/admin/discover?tab=wire" className="ak-dash3__link">Full Wire →</Link>
                        </div>
                        {wire.length === 0
                            ? <div className="ak-dash3__empty">The wire fills every 30 minutes.</div>
                            : <ul>{wire.map((w) => <WireItem key={w.id} w={w} compact />)}</ul>}
                    </section>
                </>
            )}
        </div>
    );
}
