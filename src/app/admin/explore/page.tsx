import { Suspense } from 'react';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { exploreConfig } from '@/lib/explore/config';
import { manualGate } from '@/lib/explore/generate';
import { viewsDigest } from '@/lib/explore/digest';
import { getSystemReport } from '@/lib/explore/system';
import type { InsightRow } from '@/lib/explore/types';
import ExploreSections, { type Glance } from '@/components/admin/explore/ExploreSections';
import RegenerateButton from '@/components/admin/explore/RegenerateButton';
import SystemPill from '@/components/admin/explore/SystemPill';

export const dynamic = 'force-dynamic';
// The System pill streams in behind the health probes (yt-dlp worker can take a while).
export const maxDuration = 90;

const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

/** Next scheduled run: the cron fires at 11:00 and 23:00 UTC. */
function nextCronIso(now = new Date()): string {
    const d = new Date(now);
    for (let i = 0; i < 3; i++) {
        for (const h of [11, 23]) {
            const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + i, h, 0, 0);
            if (t > now.getTime()) return new Date(t).toISOString();
        }
    }
    return now.toISOString();
}

async function tableCount(table: string): Promise<number> {
    const { count, error } = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
    return error ? 0 : count ?? 0;
}

async function SystemPillLoader({ systemCards }: { systemCards: InsightRow[] }) {
    const report = await getSystemReport();
    return <SystemPill report={report} cards={systemCards} />;
}

function SystemPillFallback() {
    return (
        <div className="ak-xp-pill ak-xp-pill--idle" aria-busy="true">
            <span className="ak-xp-dot ak-xp-dot--idle" aria-hidden="true" />
            <span>Checking systems</span>
        </div>
    );
}

export default async function ExplorePage() {
    const nowIso = new Date().toISOString();
    const [insRes, lastRunRes, gate, views, radarCount, wireCount] = await Promise.all([
        supabaseAdmin.from('explore_insights')
            .select('id, section, type, kind, title, why, details, recommendation, sources, anime, confidence, rank, created_at')
            .eq('state', 'new').gt('expires_at', nowIso)
            .order('rank', { ascending: true }).limit(40),
        supabaseAdmin.from('explore_runs')
            .select('started_at, finished_at, status, skip_reason, digest_stats')
            .in('status', ['ok', 'partial', 'skipped', 'error'])
            .order('started_at', { ascending: false }).limit(1).maybeSingle(),
        manualGate().catch(() => ({ allowed: false, usedToday: 0, limit: 3 } as Awaited<ReturnType<typeof manualGate>>)),
        viewsDigest().then((v) => v.views).catch(() => ({} as Record<string, any>)),
        tableCount('release_radar'),
        tableCount('wire_items'),
    ]);

    const insights = (insRes.data || []) as InsightRow[];
    const lastRun = lastRunRes.data;
    const hasKey = exploreConfig.hasKey();
    const enabled = exploreConfig.enabled();

    const glance: Glance[] = Object.entries(views)
        .filter(([, v]) => v?.week)
        .map(([platform, v]) => ({ platform, last: v.week.last_7d, prior: v.week.prior_7d, change: v.week.change_pct, through: v.data_through }))
        .sort((a, b) => ['instagram', 'threads', 'x', 'website'].indexOf(a.platform) - ['instagram', 'threads', 'x', 'website'].indexOf(b.platform));

    const lastGood = insights.length ? insights.reduce((m, r) => (r.created_at > m ? r.created_at : m), insights[0].created_at) : null;
    const missing = new Set<string>();
    const stats = (lastRun?.digest_stats || {}) as Record<string, { missing?: string[] }>;
    for (const s of Object.values(stats)) for (const m of s?.missing || []) missing.add(m);

    const statusLine = !enabled
        ? 'Explore is switched off'
        : !hasKey
            ? 'Claude is not connected yet'
            : lastGood
                ? `Updated ${fmtTime(lastGood)} · next at ${fmtTime(nextCronIso())}`
                : `First read at ${fmtTime(nextCronIso())}`;

    return (
        <div className="ak-xp">
            <header className="ak-xp__head">
                <div className="min-w-0">
                    <div className="ak-overline">洞察 · Explore</div>
                    <h1 className="ak-display ak-xp__title">What&apos;s worth your time</h1>
                    <div className="ak-caption">{statusLine}</div>
                </div>
                <RegenerateButton hasKey={hasKey} enabled={enabled} allowed={gate.allowed} reason={gate.reason ?? null} nextAt={gate.nextAt ?? null} />
            </header>

            <Suspense fallback={<SystemPillFallback />}>
                <SystemPillLoader systemCards={insights.filter((i) => i.section === 'system')} />
            </Suspense>

            <ExploreSections
                world={insights.filter((i) => i.section === 'world')}
                ours={insights.filter((i) => i.section === 'ours')}
                glance={glance}
                hasKey={hasKey && enabled}
                worldHasData={radarCount + wireCount > 0}
            />

            {missing.size > 0 && (
                <p className="ak-caption ak-xp__foot">Not available this run: {[...missing].join(', ')}</p>
            )}
        </div>
    );
}
