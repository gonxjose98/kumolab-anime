/**
 * Cards that used to render on the Dashboard (system health, social pulse, stat
 * tiles). No longer rendered there since the 2026-10 trim (Today / Radar / Wire);
 * kept here, intact, for the Explore tab or anywhere else that wants them.
 */
import Link from 'next/link';
import { getHealthSnapshot, type HealthSnapshot, type HealthLevel } from '@/lib/engine/health-monitor';
import { fetchIGDashboardData } from '@/lib/social/ig-insights';

// Health level → semantic dot color (sky palette)
const LEVEL_DOT: Record<HealthLevel, string> = {
    crit: '#c03d33',
    warn: '#8a6420',
    ok: '#2e9e63',
};

export async function StreamedHealthCard() {
    const snapshot = await getHealthSnapshot().catch((e): HealthSnapshot => ({
        overall: 'crit',
        checks: [{ key: 'health', label: 'Health Monitor', level: 'crit', detail: `Snapshot failed: ${e?.message ?? 'unknown'}` }],
        checkedAt: new Date().toISOString(),
    }));
    return <HealthCard snapshot={snapshot} />;
}

export function HealthCardSkeleton() {
    return (
        <div className="ak-card flex items-center justify-between">
            <span className="ak-title">System health</span>
            <span className="ak-caption">Checking…</span>
        </div>
    );
}

export async function StreamedSocialPulse() {
    const ig = await fetchIGDashboardData().catch(() => null);
    return <SocialPulseCard snapshot={ig?.snapshot} />;
}

export function SocialPulseCard({ snapshot }: { snapshot?: { followers: number | null; reach28d: number | null; views28d: number | null } }) {
    const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US'));
    return (
        <div className="ak-card ak-pulse">
            <div className="ak-pulse__head">
                <span className="ak-overline">Social pulse · Instagram</span>
                <Link href="/admin/analytics" className="ak-caption" style={{ color: 'var(--gold-text)', textDecoration: 'none' }}>Full analytics →</Link>
            </div>
            <div className="ak-pulse__grid">
                <MiniPulse label="Followers" value={fmt(snapshot?.followers)} />
                <MiniPulse label="Reach · 28d" value={fmt(snapshot?.reach28d)} />
                <MiniPulse label="Views · 28d" value={fmt(snapshot?.views28d)} />
            </div>
        </div>
    );
}

function MiniPulse({ label, value }: { label: string; value: string }) {
    return (
        <div className="ak-pulse__stat">
            <div className="ak-pulse__num">{value}</div>
            <div className="ak-pulse__lbl">{label}</div>
        </div>
    );
}

export function SocialPulseSkeleton() {
    return (
        <div className="ak-card flex items-center justify-between">
            <span className="ak-title">Social pulse</span>
            <span className="ak-caption">Loading…</span>
        </div>
    );
}

export function StatCard({ label, value, tone, sub }: { label: string; value: number | string; tone?: 'attention'; sub?: string }) {
    return (
        <div className="ak-stat">
            <span className="ak-overline">{label}</span>
            <div className="ak-stat__num" style={tone === 'attention' ? { color: '#8a6420' } : undefined}>{value}</div>
            <span className="ak-caption">{sub || ' '}</span>
        </div>
    );
}

export function HealthCard({ snapshot }: { snapshot: HealthSnapshot }) {
    const cls = snapshot.overall === 'crit' ? 'ak-badge--error' : snapshot.overall === 'warn' ? 'ak-badge--pending' : 'ak-badge--published';
    const label = snapshot.overall === 'crit' ? 'Action needed' : snapshot.overall === 'warn' ? 'Degraded' : 'All systems go';

    const issues = snapshot.checks.filter((c) => c.level !== 'ok').length;
    // Collapsed when everything's healthy (declutter); auto-opens when there's
    // something to look at, so problems are never hidden.
    return (
        <details className="ak-card ak-card--flush group" open={snapshot.overall !== 'ok'}>
            <summary className="flex items-center justify-between p-5 cursor-pointer list-none">
                <div className="flex items-center gap-3">
                    <span className="ak-title">System health</span>
                    <span className={`ak-badge ${cls}`}>{label}</span>
                    {issues > 0 && <span className="ak-caption">{issues} to check</span>}
                </div>
                <span className="ak-caption">
                    <span className="group-open:hidden">Show</span>
                    <span className="hidden group-open:inline">Hide</span>
                </span>
            </summary>
            <div className="px-5 pb-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {snapshot.checks.map((c) => (
                        <HealthRow key={c.key} level={c.level} label={c.label} detail={c.detail} actionable={c.actionable} />
                    ))}
                </div>
            </div>
        </details>
    );
}

export function HealthRow({ level, label, detail, actionable }: { level: HealthLevel; label: string; detail: string; actionable?: string }) {
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
