import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/admin';
import PendingReviewActions from '@/components/admin/dashboard/PendingReviewActions';
import { checkMetaTokenHealth, type MetaTokenHealth } from '@/lib/engine/token-health';

export const dynamic = 'force-dynamic';

// ─── Helpers ──────────────────────────────────────────────────

function timeAgo(iso: string | null | undefined): string {
    if (!iso) return '—';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return 'just now';
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
}

function formatSlot(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }) + ' ET';
}

const CLAIM_LABEL: Record<string, string> = {
    TRAILER_DROP: 'Trailer',
    NEW_KEY_VISUAL: 'Key Visual',
    NEW_SEASON_CONFIRMED: 'New Season',
    DATE_ANNOUNCED: 'Release Date',
    DELAY: 'Delay',
    CAST_ADDITION: 'Cast',
    STAFF_UPDATE: 'Staff',
    OTHER: 'News',
};

const CLAIM_COLOR: Record<string, string> = {
    TRAILER_DROP: '#ff3cac',
    NEW_KEY_VISUAL: '#7b61ff',
    NEW_SEASON_CONFIRMED: '#00d4ff',
    DATE_ANNOUNCED: '#ffaa00',
    DELAY: '#ff6b35',
    CAST_ADDITION: '#00ff88',
    STAFF_UPDATE: '#00ff88',
    OTHER: '#9ca3af',
};

// ─── Data fetch ───────────────────────────────────────────────

async function fetchDashboardData() {
    const now = new Date();
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
        { count: publishedTotal },
        { count: published24h },
        { count: pendingCount },
        { count: scheduledCount },
        { count: errors24h },
        { data: pendingPosts },
        { data: scheduledPosts },
        { data: recentlyPublished },
        { data: sourceHealth },
        { data: recentActivity },
        metaTokenHealth,
    ] = await Promise.all([
        supabaseAdmin.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'published'),
        supabaseAdmin.from('posts').select('*', { count: 'exact', head: true }).gte('published_at', last24h.toISOString()),
        supabaseAdmin.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabaseAdmin.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'approved').gte('scheduled_post_time', now.toISOString()).lte('scheduled_post_time', next24h.toISOString()),
        supabaseAdmin.from('error_logs').select('*', { count: 'exact', head: true }).gte('created_at', last24h.toISOString()),
        supabaseAdmin.from('posts').select('id, title, slug, image, source, claim_type, youtube_video_id, timestamp').eq('status', 'pending').order('timestamp', { ascending: false }).limit(8),
        supabaseAdmin.from('posts').select('id, title, image, source, claim_type, scheduled_post_time, youtube_video_id').eq('status', 'approved').gte('scheduled_post_time', now.toISOString()).lte('scheduled_post_time', next24h.toISOString()).order('scheduled_post_time', { ascending: true }).limit(10),
        supabaseAdmin.from('posts').select('id, title, slug, image, source, claim_type, published_at, social_ids, youtube_video_id').eq('status', 'published').order('published_at', { ascending: false }).limit(6),
        supabaseAdmin.from('source_health').select('source_name, source_type, tier, health_score, consecutive_failures, is_enabled, last_success').order('source_name', { ascending: true }),
        supabaseAdmin.from('scraper_logs').select('decision, reason, source_name, candidate_title, score, created_at').order('created_at', { ascending: false }).limit(15),
        checkMetaTokenHealth().catch((e): MetaTokenHealth => ({ ok: false, reason: e?.message ?? 'check failed' })),
    ]);

    return {
        stats: {
            publishedTotal: publishedTotal ?? 0,
            published24h: published24h ?? 0,
            pending: pendingCount ?? 0,
            scheduled24h: scheduledCount ?? 0,
            errors24h: errors24h ?? 0,
        },
        pendingPosts: pendingPosts || [],
        scheduledPosts: scheduledPosts || [],
        recentlyPublished: recentlyPublished || [],
        sourceHealth: sourceHealth || [],
        recentActivity: recentActivity || [],
        metaTokenHealth,
    };
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

function ClaimPill({ claim }: { claim: string | null }) {
    const key = (claim || 'OTHER').toUpperCase();
    const color = CLAIM_COLOR[key] || CLAIM_COLOR.OTHER;
    const label = CLAIM_LABEL[key] || CLAIM_LABEL.OTHER;
    return (
        <span
            className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ background: `${color}18`, border: `1px solid ${color}35`, color }}
        >
            {label}
        </span>
    );
}

function PlatformBadge({ icon, on }: { icon: string; on: boolean }) {
    return (
        <span
            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
                background: on ? 'rgba(0,255,136,0.10)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${on ? 'rgba(0,255,136,0.30)' : 'rgba(255,255,255,0.06)'}`,
                color: on ? '#7af0a8' : 'var(--text-muted)',
            }}
            title={on ? `Published to ${icon}` : `Not on ${icon}`}
        >
            {icon}
        </span>
    );
}

// ─── Page ─────────────────────────────────────────────────────

export default async function DashboardPage() {
    const data = await fetchDashboardData();
    const { stats } = data;

    const status = stats.errors24h > 0 ? 'caution' : 'green';
    const statusColor = status === 'green' ? '#00ff88' : '#ffaa00';
    const statusLabel = status === 'green' ? 'All systems operational' : `${stats.errors24h} error${stats.errors24h === 1 ? '' : 's'} in last 24h`;

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* ── Title block ──────────────────────────────────────── */}
            <div className="flex items-end justify-between flex-wrap gap-3 px-1">
                <div>
                    <h1
                        className="text-2xl md:text-3xl font-black tracking-tight"
                        style={{
                            fontFamily: 'var(--font-display)',
                            background: 'linear-gradient(135deg, #00d4ff 0%, #7b61ff 50%, #ff3cac 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}
                    >
                        Console
                    </h1>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        the cloud sees everything first
                    </p>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                     style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: statusColor, boxShadow: `0 0 8px ${statusColor}` }}
                    />
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                        {statusLabel}
                    </span>
                </div>
            </div>

            {/* ── Stat grid ────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Published 24h" value={stats.published24h} accent="#00ff88" />
                <StatCard label="Pending Review" value={stats.pending} accent="#ffaa00" highlight={stats.pending > 0} />
                <StatCard label="Scheduled 24h" value={stats.scheduled24h} accent="#00d4ff" />
                <StatCard label="Errors 24h" value={stats.errors24h} accent={stats.errors24h > 0 ? '#ff4444' : '#9ca3af'} highlight={stats.errors24h > 0} />
            </div>

            {/* ── Platform tokens ──────────────────────────────────── */}
            <PlatformTokenCard health={data.metaTokenHealth} />

            {/* ── Pending review ───────────────────────────────────── */}
            <Card className="p-5">
                <SectionHeader label="Pending Review" count={data.pendingPosts.length} accent="#ffaa00" />
                {data.pendingPosts.length === 0 ? (
                    <EmptyState text="Nothing waiting on you. Auto-publish handled everything that came through." />
                ) : (
                    <ul className="space-y-2">
                        {data.pendingPosts.map(p => (
                            <li
                                key={p.id}
                                className="flex items-center gap-4 p-3 rounded-lg"
                                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
                            >
                                <Thumbnail src={p.image} youtube_id={p.youtube_video_id} />
                                <div className="flex-1 min-w-0">
                                    <Link
                                        href={`/admin/post/${p.id}`}
                                        className="block text-sm font-semibold truncate hover:underline"
                                        style={{ color: 'var(--text-primary)' }}
                                    >
                                        {p.title}
                                    </Link>
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <ClaimPill claim={p.claim_type} />
                                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                            {p.source} • {timeAgo(p.timestamp)}
                                        </span>
                                    </div>
                                </div>
                                <PendingReviewActions postId={p.id} />
                            </li>
                        ))}
                    </ul>
                )}
            </Card>

            {/* ── Scheduled next 24h + Recently published ─────────── */}
            <div className="grid md:grid-cols-2 gap-3">
                <Card className="p-5">
                    <SectionHeader label="Next 24 hours" count={data.scheduledPosts.length} accent="#00d4ff" />
                    {data.scheduledPosts.length === 0 ? (
                        <EmptyState text="No scheduled posts in the next day." compact />
                    ) : (
                        <ul className="space-y-2">
                            {data.scheduledPosts.map(p => (
                                <li key={p.id} className="flex items-center gap-3 py-1.5">
                                    <span
                                        className="text-[10px] font-mono px-2 py-1 rounded shrink-0"
                                        style={{
                                            background: 'rgba(0,212,255,0.08)',
                                            border: '1px solid rgba(0,212,255,0.20)',
                                            color: '#7adfff',
                                            minWidth: '110px',
                                        }}
                                    >
                                        {formatSlot(p.scheduled_post_time)}
                                    </span>
                                    <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                                        {p.title}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>

                <Card className="p-5">
                    <SectionHeader label="Recently Published" count={data.recentlyPublished.length} accent="#00ff88" />
                    {data.recentlyPublished.length === 0 ? (
                        <EmptyState text="Nothing published yet." compact />
                    ) : (
                        <ul className="space-y-2.5">
                            {data.recentlyPublished.map(p => {
                                const onIG = !!p.social_ids?.instagram_id;
                                return (
                                    <li key={p.id} className="flex items-start gap-2 py-1">
                                        <span style={{ color: '#7af0a8' }} className="text-xs mt-0.5 shrink-0">✓</span>
                                        <div className="flex-1 min-w-0">
                                            <Link
                                                href={`/blog/${p.slug}`}
                                                target="_blank"
                                                className="block text-xs truncate hover:underline"
                                                style={{ color: 'var(--text-secondary)' }}
                                            >
                                                {p.title}
                                            </Link>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                                                    {timeAgo(p.published_at)}
                                                </span>
                                                <PlatformBadge icon="WEB" on={true} />
                                                <PlatformBadge icon="IG" on={onIG} />
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Card>
            </div>

            {/* ── Source health (collapsible) ──────────────────────── */}
            <details className="group">
                <Card className="p-0 overflow-hidden">
                    <summary className="flex items-center justify-between p-5 cursor-pointer list-none hover:bg-white/[0.02] transition-colors">
                        <SectionHeader label="Source Health" count={`${data.sourceHealth.filter(s => s.is_enabled && s.consecutive_failures === 0).length}/${data.sourceHealth.length}`} accent="#7b61ff" />
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            <span className="group-open:hidden">Show</span>
                            <span className="hidden group-open:inline">Hide</span>
                        </span>
                    </summary>
                    <div className="px-5 pb-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
                            {data.sourceHealth.map(s => {
                                const healthy = s.is_enabled && s.consecutive_failures === 0 && s.health_score >= 50;
                                const dot = !s.is_enabled ? '#ff4444' : (s.consecutive_failures > 0 ? '#ffaa00' : '#00ff88');
                                return (
                                    <div key={s.source_name} className="flex items-center gap-2.5 text-[11px]">
                                        <span
                                            className="w-1.5 h-1.5 rounded-full shrink-0"
                                            style={{ background: dot, boxShadow: `0 0 6px ${dot}` }}
                                        />
                                        <span className="flex-1 truncate" style={{ color: healthy ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}>
                                            {s.source_name}
                                        </span>
                                        <span className="font-mono text-[9px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                                            {s.last_success ? timeAgo(s.last_success) : 'never'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </Card>
            </details>

            {/* ── Recent activity (collapsible) ────────────────────── */}
            <details className="group">
                <Card className="p-0 overflow-hidden">
                    <summary className="flex items-center justify-between p-5 cursor-pointer list-none hover:bg-white/[0.02] transition-colors">
                        <SectionHeader label="Recent Activity" count={data.recentActivity.length} accent="#9ca3af" />
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                            <span className="group-open:hidden">Show</span>
                            <span className="hidden group-open:inline">Hide</span>
                        </span>
                    </summary>
                    <div className="px-5 pb-5">
                        {data.recentActivity.length === 0 ? (
                            <EmptyState text="No recent pipeline activity." compact />
                        ) : (
                            <ul className="space-y-1">
                                {data.recentActivity.map((row, i) => {
                                    const accepted = row.decision?.startsWith('accepted');
                                    const rejected = row.decision?.startsWith('rejected');
                                    const color = accepted ? '#7af0a8' : rejected ? '#9ca3af' : '#ffaa00';
                                    return (
                                        <li key={i} className="flex items-center gap-3 py-1 text-[11px]">
                                            <span className="font-mono w-12 shrink-0" style={{ color: 'var(--text-muted)' }}>
                                                {timeAgo(row.created_at)}
                                            </span>
                                            <span
                                                className="font-mono uppercase text-[9px] px-1.5 py-0.5 rounded shrink-0"
                                                style={{ background: `${color}12`, border: `1px solid ${color}30`, color, minWidth: '80px', textAlign: 'center' }}
                                            >
                                                {row.decision?.replace('_', ' ') || '—'}
                                            </span>
                                            <span className="flex-1 truncate" style={{ color: 'var(--text-tertiary)' }}>
                                                {row.candidate_title}
                                            </span>
                                            <span className="text-[10px] truncate max-w-xs hidden md:inline" style={{ color: 'var(--text-muted)' }}>
                                                {row.reason}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </Card>
            </details>

            {/* ── Footer ───────────────────────────────────────────── */}
            <div className="text-center pt-2 pb-4">
                <span className="text-[9px] font-mono uppercase tracking-[0.3em]" style={{ color: 'var(--text-muted)' }}>
                    KumoLab Console · {stats.publishedTotal} published all-time
                </span>
            </div>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────

function PlatformTokenCard({ health }: { health: MetaTokenHealth }) {
    let accent: string;
    let label: string;
    let detail: string;

    if (!health.ok) {
        accent = '#ff4444';
        label = 'Meta IG token: action needed';
        detail = health.reason ?? 'token check failed';
    } else if (health.daysUntilDataAccessExpiry !== null && health.daysUntilDataAccessExpiry !== undefined) {
        const days = health.daysUntilDataAccessExpiry;
        if (days < 7) accent = '#ff4444';
        else if (days < 30) accent = '#ffaa00';
        else accent = '#00ff88';
        label = `Meta IG token: ${days} day${days === 1 ? '' : 's'} of data-access window left`;
        detail = days < 30
            ? 'Reauth Meta to refresh — see CLAUDE.md §12 for the token-mint flow.'
            : 'Auto-refreshes whenever the publisher hits Meta. No action needed.';
    } else {
        accent = '#00ff88';
        label = 'Meta IG token: valid (no expiry reported)';
        detail = 'Token is valid; Meta did not return a data-access window. No action needed.';
    }

    return (
        <Card className="p-4">
            <div className="flex items-start gap-3">
                <span
                    className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                    style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
                />
                <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {label}
                    </div>
                    <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        {detail}
                    </div>
                </div>
            </div>
        </Card>
    );
}

function StatCard({ label, value, accent, highlight = false }: { label: string; value: number; accent: string; highlight?: boolean }) {
    return (
        <Card className="p-4">
            <div className="flex flex-col gap-1">
                <span
                    className="text-[9px] font-bold uppercase tracking-[0.2em]"
                    style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}
                >
                    {label}
                </span>
                <span
                    className="text-2xl md:text-3xl font-black"
                    style={{
                        color: highlight ? accent : 'var(--text-primary)',
                        fontFamily: 'var(--font-display)',
                        textShadow: highlight ? `0 0 20px ${accent}40` : 'none',
                    }}
                >
                    {value}
                </span>
            </div>
        </Card>
    );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
    return (
        <div
            className={`text-center ${compact ? 'py-3' : 'py-6'} text-[11px]`}
            style={{ color: 'var(--text-muted)' }}
        >
            {text}
        </div>
    );
}

function Thumbnail({ src, youtube_id }: { src?: string | null; youtube_id?: string | null }) {
    const url = youtube_id ? `https://img.youtube.com/vi/${youtube_id}/mqdefault.jpg` : src;
    if (!url || url.includes('placeholder')) {
        return (
            <div
                className="w-12 h-12 rounded shrink-0 flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
                <span className="text-[8px] font-mono" style={{ color: 'var(--text-muted)' }}>—</span>
            </div>
        );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="w-12 h-12 rounded object-cover shrink-0" style={{ border: '1px solid rgba(255,255,255,0.06)' }} />;
}
