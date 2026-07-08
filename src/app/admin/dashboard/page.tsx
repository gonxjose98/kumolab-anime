import Link from 'next/link';
import { Suspense } from 'react';
import { supabaseAdmin } from '@/lib/supabase/admin';
import PendingReviewActions from '@/components/admin/dashboard/PendingReviewActions';
import ErrorsPopover from '@/components/admin/dashboard/ErrorsPopover';
import ImportFromUrlButton from '@/components/admin/dashboard/ImportFromUrlButton';
import { getHealthSnapshot, type HealthSnapshot, type HealthLevel } from '@/lib/engine/health-monitor';

export const dynamic = 'force-dynamic';

// ─── Helpers ──────────────────────────────────────────────────

function timeAgo(iso: string | null | undefined): string {
    if (!iso) return '-';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return 'just now';
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
}

function formatSlot(iso: string | null): string {
    if (!iso) return '-';
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

// Health level → semantic dot color (sky palette)
const LEVEL_DOT: Record<HealthLevel, string> = {
    crit: '#c03d33',
    warn: '#8a6420',
    ok: '#2e9e63',
};

// ─── Data fetch ───────────────────────────────────────────────

async function fetchDashboardData() {
    const now = new Date();
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // getHealthSnapshot() is intentionally NOT in this Promise.all — it can
    // take up to 60s on a cold yt-dlp worker; it streams via <Suspense> below.
    const [
        { count: publishedTotal },
        { count: published24h },
        { count: pendingCount },
        { count: scheduledCount },
        { count: errors24h },
        { data: recentErrors },
        { data: pendingPosts },
        { data: scheduledPosts },
        { data: recentlyPublished },
        { data: sourceHealth },
        { data: recentActivity },
    ] = await Promise.all([
        supabaseAdmin.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'published'),
        supabaseAdmin.from('posts').select('*', { count: 'exact', head: true }).gte('published_at', last24h.toISOString()),
        supabaseAdmin.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabaseAdmin.from('posts').select('*', { count: 'exact', head: true }).eq('status', 'approved').gte('scheduled_post_time', now.toISOString()).lte('scheduled_post_time', next24h.toISOString()),
        supabaseAdmin.from('error_logs').select('*', { count: 'exact', head: true }).gte('created_at', last24h.toISOString()),
        supabaseAdmin.from('error_logs').select('id, source, error_message, context, created_at').gte('created_at', last24h.toISOString()).order('created_at', { ascending: false }).limit(20),
        supabaseAdmin.from('posts').select('id, title, slug, image, source, claim_type, youtube_video_id, timestamp').eq('status', 'pending').order('timestamp', { ascending: false }).limit(8),
        supabaseAdmin.from('posts').select('id, title, image, source, claim_type, scheduled_post_time, youtube_video_id').eq('status', 'approved').gte('scheduled_post_time', now.toISOString()).lte('scheduled_post_time', next24h.toISOString()).order('scheduled_post_time', { ascending: true }).limit(10),
        supabaseAdmin.from('posts').select('id, title, slug, image, source, claim_type, published_at, social_ids, youtube_video_id').eq('status', 'published').order('published_at', { ascending: false }).limit(6),
        supabaseAdmin.from('source_health').select('source_name, source_type, tier, health_score, consecutive_failures, is_enabled, last_success').order('source_name', { ascending: true }),
        supabaseAdmin.from('scraper_logs').select('decision, reason, source_name, candidate_title, score, created_at').order('created_at', { ascending: false }).limit(15),
    ]);

    return {
        stats: {
            publishedTotal: publishedTotal ?? 0,
            published24h: published24h ?? 0,
            pending: pendingCount ?? 0,
            scheduled24h: scheduledCount ?? 0,
            errors24h: errors24h ?? 0,
        },
        recentErrors: recentErrors || [],
        pendingPosts: pendingPosts || [],
        scheduledPosts: scheduledPosts || [],
        recentlyPublished: recentlyPublished || [],
        sourceHealth: sourceHealth || [],
        recentActivity: recentActivity || [],
    };
}

async function StreamedHealthCard() {
    const snapshot = await getHealthSnapshot().catch((e): HealthSnapshot => ({
        overall: 'crit',
        checks: [{ key: 'health', label: 'Health Monitor', level: 'crit', detail: `Snapshot failed: ${e?.message ?? 'unknown'}` }],
        checkedAt: new Date().toISOString(),
    }));
    return <HealthCard snapshot={snapshot} />;
}

function HealthCardSkeleton() {
    return (
        <div className="ak-card">
            <div className="ak-card__header">
                <span className="ak-title">System health</span>
                <span className="ak-caption">Checking…</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg animate-pulse" style={{ background: 'var(--surface-2)' }}>
                        <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: 'var(--line-2)' }} />
                        <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="h-2.5 rounded w-1/3" style={{ background: 'var(--line-2)' }} />
                            <div className="h-2 rounded w-2/3" style={{ background: 'var(--line)' }} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── UI primitives (Clear Skies) ──────────────────────────────

function ClaimPill({ claim }: { claim: string | null }) {
    const key = (claim || 'OTHER').toUpperCase();
    const label = CLAIM_LABEL[key] || CLAIM_LABEL.OTHER;
    return (
        <span
            className="ak-badge ak-badge--bare"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--line)', color: 'var(--ink-2)', fontWeight: 600 }}
        >
            {label}
        </span>
    );
}

function PlatformBadge({ icon, on }: { icon: string; on: boolean }) {
    return (
        <span
            className={`ak-badge ak-badge--bare`}
            style={
                on
                    ? { color: '#1d7a4f', background: '#e2f4ea', borderColor: '#b9e0c9', fontWeight: 600 }
                    : { color: 'var(--ink-3)', background: 'var(--surface-2)', borderColor: 'var(--line)', fontWeight: 600 }
            }
            title={on ? `Published to ${icon}` : `Not on ${icon}`}
        >
            {icon}
        </span>
    );
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
    return (
        <div className="text-center ak-caption" style={{ padding: compact ? '12px 0' : '28px 0' }}>
            {text}
        </div>
    );
}

function Thumbnail({ src, youtube_id }: { src?: string | null; youtube_id?: string | null }) {
    const url = (src && !src.includes('placeholder')) ? src
        : (youtube_id ? `https://img.youtube.com/vi/${youtube_id}/mqdefault.jpg` : null);
    if (!url || url.includes('placeholder')) {
        return (
            <div className="w-12 h-12 rounded-lg shrink-0 flex items-center justify-center" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                <span className="ak-caption">—</span>
            </div>
        );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" style={{ border: '1px solid var(--line)' }} />;
}

// ─── Page ─────────────────────────────────────────────────────

export default async function DashboardPage() {
    const data = await fetchDashboardData();
    const { stats } = data;

    return (
        <div className="flex flex-col gap-6">
            {/* ── Stat grid ────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Published · 24h" value={stats.published24h} />
                <StatCard label="Pending review" value={stats.pending} tone={stats.pending > 0 ? 'attention' : undefined} />
                <StatCard label="Scheduled · 24h" value={stats.scheduled24h} />
                <div className="ak-stat" style={stats.errors24h > 0 ? { borderTop: '3px solid var(--sun)' } : undefined}>
                    <div className="flex items-start justify-between gap-2">
                        <span className="ak-overline">Errors · 24h</span>
                        <ErrorsPopover count={stats.errors24h} errors={data.recentErrors} />
                    </div>
                    <div className="ak-stat__num" style={stats.errors24h > 0 ? { color: 'var(--sun)' } : undefined}>{stats.errors24h}</div>
                    <span className="ak-caption">{stats.errors24h > 0 ? 'needs a look' : 'all clear'}</span>
                </div>
            </div>

            {/* ── Pending review (hero) + right rail ──────────────── */}
            <div className="grid lg:grid-cols-3 gap-6 items-start">
                <div className="ak-card ak-card--flush lg:col-span-2">
                    <div className="flex items-center justify-between gap-3 p-5 pb-3">
                        <div className="flex items-center gap-3">
                            <span className="ak-title">Needs your review</span>
                            {data.pendingPosts.length > 0 && (
                                <span className="ak-pill__count">{data.pendingPosts.length}</span>
                            )}
                        </div>
                        <ImportFromUrlButton />
                    </div>
                    {data.pendingPosts.length === 0 ? (
                        <div className="ak-empty">
                            <span className="ak-empty__glyph" aria-hidden="true">☁</span>
                            <span className="ak-heading">Nothing waiting on you</span>
                            <span className="ak-caption">Auto-publish handled everything that came through.</span>
                        </div>
                    ) : (
                        <ul>
                            {data.pendingPosts.map((p) => (
                                <li key={p.id} className="flex items-center gap-4 px-5 py-3" style={{ borderTop: '1px solid var(--line)' }}>
                                    <Thumbnail src={p.image} youtube_id={p.youtube_video_id} />
                                    <div className="flex-1 min-w-0">
                                        <Link href={`/admin/post/${p.id}`} className="block ak-heading truncate" style={{ textDecoration: 'none' }}>
                                            {p.title}
                                        </Link>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <ClaimPill claim={p.claim_type} />
                                            <span className="ak-caption">{p.source} · {timeAgo(p.timestamp)}</span>
                                        </div>
                                    </div>
                                    <PendingReviewActions postId={p.id} postTitle={p.title} />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex flex-col gap-6">
                    {/* Up next */}
                    <div className="ak-card">
                        <div className="ak-card__header">
                            <span className="ak-title">Up next</span>
                            <span className="ak-caption">next 24h</span>
                        </div>
                        {data.scheduledPosts.length === 0 ? (
                            <EmptyState text="Nothing scheduled in the next day." compact />
                        ) : (
                            <ul className="flex flex-col gap-2.5">
                                {data.scheduledPosts.map((p) => (
                                    <li key={p.id} className="flex items-center gap-3">
                                        <span className="ak-caption shrink-0" style={{ color: 'var(--blue)', fontWeight: 600, minWidth: '112px', fontVariantNumeric: 'tabular-nums' }}>
                                            {formatSlot(p.scheduled_post_time)}
                                        </span>
                                        <span className="ak-body-sm truncate">{p.title}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* Recently published */}
                    <div className="ak-card">
                        <div className="ak-card__header">
                            <span className="ak-title">Recently published</span>
                        </div>
                        {data.recentlyPublished.length === 0 ? (
                            <EmptyState text="Nothing published yet." compact />
                        ) : (
                            <ul className="flex flex-col gap-3">
                                {data.recentlyPublished.map((p) => {
                                    const onIG = !!p.social_ids?.instagram_id;
                                    return (
                                        <li key={p.id} className="flex items-start gap-2">
                                            <span style={{ color: '#2e9e63' }} className="ak-body-sm mt-0.5 shrink-0">✓</span>
                                            <div className="flex-1 min-w-0">
                                                <Link href={`/blog/${p.slug}`} target="_blank" className="block ak-body-sm truncate" style={{ textDecoration: 'none' }}>
                                                    {p.title}
                                                </Link>
                                                <div className="flex items-center gap-1.5 mt-1">
                                                    <span className="ak-caption">{timeAgo(p.published_at)}</span>
                                                    <PlatformBadge icon="WEB" on={true} />
                                                    <PlatformBadge icon="IG" on={onIG} />
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </div>

            {/* ── System health (streamed) ─────────────────────────── */}
            <Suspense fallback={<HealthCardSkeleton />}>
                <StreamedHealthCard />
            </Suspense>

            {/* ── Source health (collapsible) ──────────────────────── */}
            <details className="ak-card ak-card--flush group">
                    <summary className="flex items-center justify-between p-5 cursor-pointer list-none" style={{ transition: 'background 0.15s' }}>
                        <div className="flex items-center gap-3">
                            <span className="ak-title">Source health</span>
                            <span className="ak-pill__count">{`${data.sourceHealth.filter((s) => s.is_enabled && s.consecutive_failures === 0).length}/${data.sourceHealth.length}`}</span>
                        </div>
                        <span className="ak-caption">
                            <span className="group-open:hidden">Show</span>
                            <span className="hidden group-open:inline">Hide</span>
                        </span>
                    </summary>
                    <div className="px-5 pb-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                            {data.sourceHealth.map((s) => {
                                const dot = !s.is_enabled ? '#c03d33' : (s.consecutive_failures > 0 ? '#8a6420' : '#2e9e63');
                                return (
                                    <div key={s.source_name} className="flex items-center gap-2.5">
                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dot }} />
                                        <span className="flex-1 truncate ak-body-sm">{s.source_name}</span>
                                        <span className="ak-caption shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                            {s.last_success ? timeAgo(s.last_success) : 'never'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
            </details>

            {/* ── Recent activity (collapsible) ────────────────────── */}
            <details className="ak-card ak-card--flush group">
                    <summary className="flex items-center justify-between p-5 cursor-pointer list-none">
                        <div className="flex items-center gap-3">
                            <span className="ak-title">Recent activity</span>
                            <span className="ak-pill__count">{data.recentActivity.length}</span>
                        </div>
                        <span className="ak-caption">
                            <span className="group-open:hidden">Show</span>
                            <span className="hidden group-open:inline">Hide</span>
                        </span>
                    </summary>
                    <div className="px-5 pb-5">
                        {data.recentActivity.length === 0 ? (
                            <EmptyState text="No recent pipeline activity." compact />
                        ) : (
                            <ul className="flex flex-col gap-1.5">
                                {data.recentActivity.map((row, i) => {
                                    const accepted = row.decision?.startsWith('accepted');
                                    const cls = accepted ? 'ak-badge--published' : row.decision?.startsWith('rejected') ? 'ak-badge--draft' : 'ak-badge--pending';
                                    return (
                                        <li key={i} className="flex items-center gap-3">
                                            <span className="ak-caption shrink-0" style={{ width: '48px', fontVariantNumeric: 'tabular-nums' }}>{timeAgo(row.created_at)}</span>
                                            <span className={`ak-badge ${cls}`} style={{ minWidth: '84px', justifyContent: 'center' }}>
                                                {row.decision?.replace('_', ' ') || '-'}
                                            </span>
                                            <span className="flex-1 truncate ak-body-sm">{row.candidate_title}</span>
                                            <span className="ak-caption truncate max-w-xs hidden md:inline">{row.reason}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
            </details>

            {/* ── Footer ───────────────────────────────────────────── */}
            <div className="text-center pt-1 pb-4">
                <span className="ak-caption" style={{ letterSpacing: '0.1em' }}>
                    {stats.publishedTotal} published all-time
                </span>
            </div>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────

function StatCard({ label, value, tone }: { label: string; value: number; tone?: 'attention' }) {
    return (
        <div className="ak-stat">
            <span className="ak-overline">{label}</span>
            <div className="ak-stat__num" style={tone === 'attention' ? { color: '#8a6420' } : undefined}>{value}</div>
            <span className="ak-caption">&nbsp;</span>
        </div>
    );
}

function HealthCard({ snapshot }: { snapshot: HealthSnapshot }) {
    const cls = snapshot.overall === 'crit' ? 'ak-badge--error' : snapshot.overall === 'warn' ? 'ak-badge--pending' : 'ak-badge--published';
    const label = snapshot.overall === 'crit' ? 'Action needed' : snapshot.overall === 'warn' ? 'Degraded' : 'All systems go';

    return (
        <div className="ak-card">
            <div className="ak-card__header">
                <span className="ak-title">System health</span>
                <span className={`ak-badge ${cls}`}>{label}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {snapshot.checks.map((c) => (
                    <HealthRow key={c.key} level={c.level} label={c.label} detail={c.detail} actionable={c.actionable} />
                ))}
            </div>
        </div>
    );
}

function HealthRow({ level, label, detail, actionable }: { level: HealthLevel; label: string; detail: string; actionable?: string }) {
    const color = LEVEL_DOT[level];
    return (
        <div className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
            <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: color }} />
            <div className="flex-1 min-w-0">
                <div className="ak-body-sm" style={{ color: 'var(--ink)', fontWeight: 600 }}>{label}</div>
                <div className="ak-caption mt-0.5">{detail}</div>
                {actionable && level !== 'ok' && (
                    <div className="ak-caption mt-1" style={{ color }}>→ {actionable}</div>
                )}
            </div>
        </div>
    );
}
