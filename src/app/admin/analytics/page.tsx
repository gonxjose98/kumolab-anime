import { fetchIGDashboardData, type IGDashboardData, type IGMediaInsight } from '@/lib/social/ig-insights';

export const dynamic = 'force-dynamic';

function timeAgo(iso: string | null | undefined): string {
    if (!iso) return '—';
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
        reach28d: null,
        profileViews28d: null,
        websiteClicks28d: null,
        accountsEngaged28d: null,
    },
    topRecent: [],
};

export default async function AnalyticsPage() {
    const ig: IGDashboardData = await fetchIGDashboardData().catch((e) => ({
        ...FALLBACK,
        snapshot: { ...FALLBACK.snapshot, reason: e?.message ?? 'IG fetch failed' },
    }));

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* ── Title block ──────────────────────────────────────── */}
            <div className="flex items-end justify-between flex-wrap gap-3 px-1">
                <div>
                    <h1
                        className="text-2xl md:text-3xl font-black tracking-tight"
                        style={{
                            fontFamily: 'var(--font-display)',
                            background: 'linear-gradient(135deg, #ff3cac 0%, #7b61ff 50%, #00d4ff 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}
                    >
                        Analytics
                    </h1>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        what the cloud has been seeing
                    </p>
                </div>
                <div
                    className="text-[10px] font-mono px-3 py-1.5 rounded-lg"
                    style={{
                        background: 'rgba(255,60,172,0.08)',
                        border: '1px solid rgba(255,60,172,0.20)',
                        color: '#ff7ec5',
                    }}
                >
                    Instagram · rolling 28 days
                </div>
            </div>

            <IGSection ig={ig} />
        </div>
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

    const fmt = (n: number | null) => n === null || n === undefined ? '—' : n.toLocaleString('en-US');

    return (
        <>
            {/* Account snapshot */}
            <Card className="p-5">
                <SectionHeader label="Account Snapshot" accent="#ff3cac" />
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <Metric label="Followers" value={fmt(snapshot.followers)} accent="#ff3cac" />
                    <Metric label="Posts" value={fmt(snapshot.mediaCount)} accent="#7b61ff" />
                    <Metric label="Reach" value={fmt(snapshot.reach28d)} accent="#00d4ff" sub="28d" />
                    <Metric label="Profile Views" value={fmt(snapshot.profileViews28d)} accent="#00ff88" sub="28d" />
                    <Metric label="Engaged" value={fmt(snapshot.accountsEngaged28d)} accent="#ffaa00" sub="28d" />
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
                    <EmptyState text="No recent posts to score yet — Meta hasn't returned media for this account." />
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
    return (
        <div
            className={`rounded-2xl ${className}`}
            style={{
                background: 'rgba(12, 12, 24, 0.55)',
                border: '1px solid rgba(255,255,255,0.06)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            }}
        >
            {children}
        </div>
    );
}

function SectionHeader({ label, count, accent = '#7b61ff' }: { label: string; count?: number | string; accent?: string }) {
    return (
        <div className="flex items-baseline gap-3 mb-3">
            <span
                className="text-[10px] font-bold uppercase tracking-[0.25em]"
                style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}
            >
                {label}
            </span>
            {count !== undefined && (
                <span
                    className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                    style={{
                        background: `${accent}15`,
                        border: `1px solid ${accent}30`,
                        color: accent,
                    }}
                >
                    {count}
                </span>
            )}
        </div>
    );
}

function Metric({ label, value, accent, sub }: { label: string; value: string; accent: string; sub?: string }) {
    return (
        <div
            className="rounded-xl px-4 py-3"
            style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
            }}
        >
            <div className="flex items-baseline gap-1.5 mb-1.5">
                <span
                    className="text-[9px] font-bold uppercase tracking-[0.2em]"
                    style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}
                >
                    {label}
                </span>
                {sub && (
                    <span className="text-[8px] font-mono" style={{ color: 'var(--text-muted)' }}>
                        · {sub}
                    </span>
                )}
            </div>
            <div
                className="text-2xl font-black tabular-nums"
                style={{ color: accent, fontFamily: 'var(--font-display)', textShadow: `0 0 20px ${accent}30` }}
            >
                {value}
            </div>
        </div>
    );
}

function PostRow({ m }: { m: IGMediaInsight }) {
    const isReel = m.mediaType === 'REEL' || m.mediaType === 'VIDEO';
    return (
        <li
            className="flex items-center gap-3 p-3 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
        >
            {m.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={m.thumbnail}
                    alt=""
                    className="w-12 h-12 rounded object-cover shrink-0"
                    style={{ border: '1px solid rgba(255,255,255,0.06)' }}
                />
            ) : (
                <div
                    className="w-12 h-12 rounded shrink-0"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                />
            )}
            <div className="flex-1 min-w-0">
                <a
                    href={m.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs truncate hover:underline"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    {m.caption || '(no caption)'}
                </a>
                <div className="flex items-center gap-2 mt-1.5">
                    <span
                        className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{
                            background: isReel ? 'rgba(255,60,172,0.10)' : 'rgba(123,97,255,0.10)',
                            border: `1px solid ${isReel ? 'rgba(255,60,172,0.30)' : 'rgba(123,97,255,0.30)'}`,
                            color: isReel ? '#ff7ec5' : '#a092ff',
                        }}
                    >
                        {isReel ? 'Reel' : 'Image'}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {timeAgo(m.timestamp)}
                    </span>
                </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
                <Stat label="views" value={m.views} accent="#00d4ff" />
                <Stat label="reach" value={m.reach} accent="#7b61ff" />
                <Stat label="likes" value={m.likes} accent="#ff3cac" />
                <Stat label="comments" value={m.comments} accent="#00ff88" />
            </div>
        </li>
    );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
    return (
        <div className="flex flex-col items-end leading-tight">
            <span className="text-sm font-bold tabular-nums" style={{ color: accent }}>
                {value.toLocaleString('en-US')}
            </span>
            <span
                className="text-[8px] uppercase tracking-wider"
                style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}
            >
                {label}
            </span>
        </div>
    );
}

function EmptyState({ text }: { text: string }) {
    return (
        <div className="text-center py-6 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {text}
        </div>
    );
}
