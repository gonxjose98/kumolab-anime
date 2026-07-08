import { fetchIGDashboardData, type IGDashboardData, type IGMediaInsight } from '@/lib/social/ig-insights';
import { fetchWebsiteTraffic, type WebsiteTraffic } from '@/lib/analytics/page-views';

export const dynamic = 'force-dynamic';

function timeAgo(iso: string | null | undefined): string {
    if (!iso) return '-';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return 'just now';
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
}

const FALLBACK: IGDashboardData = {
    snapshot: {
        ok: false,
        reason: 'IG fetch failed',
        followers: null,
        follows: null,
        mediaCount: null,
        views28d: null,
        reach28d: null,
        profileViews28d: null,
        websiteClicks28d: null,
        accountsEngaged28d: null,
        totalInteractions28d: null,
    },
    topRecent: [],
};

export default async function AnalyticsPage() {
    const [ig, web]: [IGDashboardData, WebsiteTraffic] = await Promise.all([
        fetchIGDashboardData().catch((e) => ({
            ...FALLBACK,
            snapshot: { ...FALLBACK.snapshot, reason: e?.message ?? 'IG fetch failed' },
        })),
        fetchWebsiteTraffic(),
    ]);

    return (
        <div className="max-w-5xl mx-auto flex flex-col gap-6">
            {/* ── Title block ──────────────────────────────────────── */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="ak-caption">What the cloud has been seeing</p>
                <span className="ak-badge ak-badge--bare" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}>
                    Instagram · rolling 28 days
                </span>
            </div>

            <WebsiteSection web={web} />
            <IGSection ig={ig} />
        </div>
    );
}

// ─── Website traffic ──────────────────────────────────────────

function WebsiteSection({ web }: { web: WebsiteTraffic }) {
    const fmt = (n: number) => n.toLocaleString('en-US');

    if (!web.ok) {
        return (
            <Card className="p-5">
                <SectionHeader label="Website" accent="#00ff88" />
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {web.reason || 'Traffic unavailable.'}
                </div>
            </Card>
        );
    }

    if (web.views30d === 0) {
        return (
            <Card className="p-5">
                <SectionHeader label="Website" accent="#00ff88" />
                <EmptyState text="No website views recorded yet. Tracking was just fixed — real visits will start appearing here within minutes of going live." />
                {web.botViews30d > 0 && (
                    <div className="text-center text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
                        ({fmt(web.botViews30d)} bot hits filtered out)
                    </div>
                )}
            </Card>
        );
    }

    return (
        <>
            <Card className="p-5">
                <SectionHeader label="Website" accent="#00ff88" />
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Metric label="Views" value={fmt(web.views30d)} accent="#00ff88" sub="30d" />
                    <Metric label="Views" value={fmt(web.views7d)} accent="#00d4ff" sub="7d" />
                    <Metric label="Bots Filtered" value={fmt(web.botViews30d)} accent="#7b61ff" sub="30d" />
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-5">
                    <SectionHeader label="Top Pages" count={web.topPaths.length} accent="#00d4ff" />
                    {web.topPaths.length === 0 ? (
                        <EmptyState text="No pages yet." />
                    ) : (
                        <ul className="space-y-2">
                            {web.topPaths.map((r) => (
                                <TrafficBar key={r.label} row={r} max={web.topPaths[0].views} accent="#00d4ff" />
                            ))}
                        </ul>
                    )}
                </Card>

                <Card className="p-5">
                    <SectionHeader label="Top Sources" count={web.topReferrers.length} accent="#ffaa00" />
                    {web.topReferrers.length === 0 ? (
                        <EmptyState text="No referrers yet — traffic is mostly direct / in-app." />
                    ) : (
                        <ul className="space-y-2">
                            {web.topReferrers.map((r) => (
                                <TrafficBar key={r.label} row={r} max={web.topReferrers[0].views} accent="#ffaa00" />
                            ))}
                        </ul>
                    )}
                </Card>
            </div>
        </>
    );
}

function TrafficBar({ row, max, accent }: { row: { label: string; views: number }; max: number; accent: string }) {
    const pct = max > 0 ? Math.max(4, Math.round((row.views / max) * 100)) : 0;
    return (
        <li className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
                <span className="ak-body-sm truncate">{row.label}</span>
                <span className="ak-body-sm shrink-0" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>
                    {row.views.toLocaleString('en-US')}
                </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--blue)', opacity: 0.85 }} />
            </div>
        </li>
    );
}

// ─── Sections ─────────────────────────────────────────────────

function IGSection({ ig }: { ig: IGDashboardData }) {
    const { snapshot, topRecent } = ig;

    if (!snapshot.ok) {
        return (
            <Card className="p-5">
                <SectionHeader label="Instagram" accent="#ff3cac" />
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {snapshot.reason || 'Insights unavailable. Re-OAuth Meta token with instagram_manage_insights scope.'}
                </div>
            </Card>
        );
    }

    const fmt = (n: number | null) => n === null || n === undefined ? '-' : n.toLocaleString('en-US');

    return (
        <>
            {/* Account snapshot */}
            <Card className="p-5">
                <SectionHeader label="Account Snapshot" accent="#ff3cac" />
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    <Metric label="Views" value={fmt(snapshot.views28d)} accent="#00d4ff" sub="28d" />
                    <Metric label="Reach" value={fmt(snapshot.reach28d)} accent="#7b61ff" sub="28d" />
                    <Metric label="Followers" value={fmt(snapshot.followers)} accent="#ff3cac" />
                    <Metric label="Posts" value={fmt(snapshot.mediaCount)} accent="#a092ff" />
                    <Metric label="Engaged" value={fmt(snapshot.accountsEngaged28d)} accent="#ffaa00" sub="28d" />
                    <Metric label="Interactions" value={fmt(snapshot.totalInteractions28d)} accent="#00ff88" sub="28d" />
                    <Metric label="Profile Views" value={fmt(snapshot.profileViews28d)} accent="#ff7ec5" sub="28d" />
                    <Metric label="Site Clicks" value={fmt(snapshot.websiteClicks28d)} accent="#ff6b35" sub="28d" />
                </div>
            </Card>

            {/* Top recent posts */}
            <Card className="p-5">
                <div className="flex items-baseline justify-between mb-3">
                    <SectionHeader label="Top Recent Posts" count={topRecent.length} accent="#00d4ff" />
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                        ranked by views
                    </span>
                </div>
                {topRecent.length === 0 ? (
                    <EmptyState text="No recent posts to score yet. Meta hasn't returned media for this account." />
                ) : (
                    <ul className="space-y-2">
                        {topRecent.map(m => (
                            <PostRow key={m.id} m={m} />
                        ))}
                    </ul>
                )}
            </Card>
        </>
    );
}

// ─── UI primitives ────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return <div className={`ak-card ${className}`}>{children}</div>;
}

function SectionHeader({ label, count }: { label: string; count?: number | string; accent?: string }) {
    return (
        <div className="flex items-baseline gap-3 mb-4">
            <span className="ak-overline">{label}</span>
            {count !== undefined && <span className="ak-pill__count">{count}</span>}
        </div>
    );
}

function Metric({ label, value, sub }: { label: string; value: string; accent?: string; sub?: string }) {
    return (
        <div className="ak-metric">
            <div className="flex items-baseline gap-1.5">
                <span className="ak-overline">{label}</span>
                {sub && <span className="ak-caption">· {sub}</span>}
            </div>
            <div className="ak-metric__num">{value}</div>
        </div>
    );
}

function PostRow({ m }: { m: IGMediaInsight }) {
    const isReel = m.mediaType === 'REEL' || m.mediaType === 'VIDEO';
    return (
        <li className="ak-uprow" style={{ padding: '10px 12px' }}>
            {m.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.thumbnail} alt="" className="w-12 h-12 rounded object-cover shrink-0" style={{ border: '1px solid var(--line)' }} />
            ) : (
                <div className="w-12 h-12 rounded shrink-0" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }} />
            )}
            <div className="flex-1 min-w-0">
                <a href={m.permalink} target="_blank" rel="noopener noreferrer" className="block ak-body-sm truncate hover:underline" style={{ color: 'var(--ink)' }}>
                    {m.caption || '(no caption)'}
                </a>
                <div className="flex items-center gap-2 mt-1.5">
                    <span className={`ak-badge ${isReel ? 'ak-badge--error' : 'ak-badge--scheduled'}`}>
                        {isReel ? 'Reel' : 'Image'}
                    </span>
                    <span className="ak-caption">{timeAgo(m.timestamp)}</span>
                </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
                <Stat label="views" value={m.views} />
                <Stat label="reach" value={m.reach} />
                <Stat label="likes" value={m.likes} />
                <Stat label="comments" value={m.comments} />
            </div>
        </li>
    );
}

function Stat({ label, value }: { label: string; value: number; accent?: string }) {
    return (
        <div className="flex flex-col items-end leading-tight">
            <span className="ak-body-sm" style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>
                {value.toLocaleString('en-US')}
            </span>
            <span className="ak-caption" style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        </div>
    );
}

function EmptyState({ text }: { text: string }) {
    return <div className="text-center ak-caption" style={{ padding: '20px 0' }}>{text}</div>;
}
