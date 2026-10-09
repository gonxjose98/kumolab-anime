import { Suspense, cache } from 'react';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { exploreConfig } from '@/lib/explore/config';
import { manualGate } from '@/lib/explore/generate';
import { viewsDigest } from '@/lib/explore/digest';
import { getSystemReport } from '@/lib/explore/system';
import { orderFeed, tileFor, topicOf, type FeedItem } from '@/lib/explore/feed';
import type { InsightRow } from '@/lib/explore/types';
import InsightsFeed from '@/components/admin/insights/InsightsFeed';
import { WeekStats, WeekBreakdown, type ViewShare } from '@/components/admin/insights/WeekRail';
import RegenerateButton from '@/components/admin/explore/RegenerateButton';
import SystemPill from '@/components/admin/explore/SystemPill';

// AI Insights (route /admin/insights). Internally still "explore": tables
// explore_insights / explore_runs and the `explore` cron worker keep their names.

export const dynamic = 'force-dynamic';
// The System pill streams in behind the health probes (yt-dlp worker can take a while).
export const maxDuration = 90;

const DAY_MS = 86_400_000;
const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

/** Next scheduled run: the cron fires at 11:00 and 23:00 UTC. */
function nextCronIso(now = new Date()): string {
    for (let i = 0; i < 3; i++) {
        for (const h of [11, 23]) {
            const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i, h, 0, 0);
            if (t > now.getTime()) return new Date(t).toISOString();
        }
    }
    return now.toISOString();
}

async function tableCount(table: string): Promise<number> {
    const { count, error } = await supabaseAdmin.from(table).select('*', { count: 'exact', head: true });
    return error ? 0 : count ?? 0;
}

// One health/system probe per request, shared by the pill and the "Need you" tile.
const loadReport = cache(getSystemReport);

async function SystemPillLoader({ systemCards }: { systemCards: InsightRow[] }) {
    const report = await loadReport();
    return <SystemPill report={report} cards={systemCards} />;
}

async function NeedsYouCount() {
    const report = await loadReport().catch(() => null);
    return <>{report ? report.needsYou.length : 0}</>;
}

function SystemPillFallback() {
    return (
        <div className="ak-xp-pill ak-xp-pill--idle" aria-busy="true">
            <span className="ak-xp-dot ak-xp-dot--idle" aria-hidden="true" />
            <span>Checking systems</span>
        </div>
    );
}

/** Posters for anime-world rows: AniList cover from the cited radar entry, else by show name, else the cited wire item's image. */
async function posterMap(rows: InsightRow[]): Promise<Map<string, string>> {
    const anilistIds = new Set<number>();
    const wireIds = new Set<number>();
    const names = new Set<string>();
    for (const r of rows) {
        if (r.section !== 'world') continue;
        for (const s of r.sources || []) {
            if (s.ref.startsWith('anilist:')) anilistIds.add(Number(s.ref.slice(8)));
            if (s.ref.startsWith('wire:')) wireIds.add(Number(s.ref.slice(5)));
        }
        if (r.anime) names.add(r.anime);
    }
    const none = Promise.resolve({ data: [] as any[] });
    const [radar, wire, byName] = await Promise.all([
        anilistIds.size ? supabaseAdmin.from('release_radar').select('anilist_id, cover_image').in('anilist_id', [...anilistIds]) : none,
        wireIds.size ? supabaseAdmin.from('wire_items').select('id, image').in('id', [...wireIds]) : none,
        names.size ? supabaseAdmin.from('release_radar').select('title_english, title_romaji, cover_image').or(`title_english.in.(${[...names].map((n) => JSON.stringify(n)).join(',')}),title_romaji.in.(${[...names].map((n) => JSON.stringify(n)).join(',')})`) : none,
    ]);
    const radarImg = new Map<number, string>((radar.data || []).filter((r: any) => r.cover_image).map((r: any) => [Number(r.anilist_id), r.cover_image]));
    const wireImg = new Map<number, string>((wire.data || []).filter((w: any) => w.image).map((w: any) => [Number(w.id), w.image]));
    const nameImg = new Map<string, string>();
    for (const r of (byName.data || []) as any[]) {
        if (!r.cover_image) continue;
        if (r.title_english) nameImg.set(String(r.title_english).toLowerCase(), r.cover_image);
        if (r.title_romaji) nameImg.set(String(r.title_romaji).toLowerCase(), r.cover_image);
    }
    const out = new Map<string, string>();
    for (const r of rows) {
        if (r.section !== 'world') continue;
        let img: string | undefined;
        for (const s of r.sources || []) if (!img && s.ref.startsWith('anilist:')) img = radarImg.get(Number(s.ref.slice(8)));
        if (!img && r.anime) img = nameImg.get(r.anime.toLowerCase());
        for (const s of r.sources || []) if (!img && s.ref.startsWith('wire:')) img = wireImg.get(Number(s.ref.slice(5)));
        if (img && /^https:\/\//.test(img)) out.set(r.id, img);
    }
    return out;
}

const TOPIC_NOTE: Record<string, string> = { News: 'news', Premieres: 'premiere', 'Our numbers': 'our-numbers', System: 'system' };
const PN: Record<string, string> = { threads: 'Threads', instagram: 'Instagram', website: 'Website', x: 'X' };

export default async function InsightsPage() {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const weekAgo = new Date(now - 7 * DAY_MS).toISOString();
    const [insRes, gate, views, radarCount, wireCount, actedRes, dismissedRes, lastRunRes] = await Promise.all([
        supabaseAdmin.from('explore_insights')
            .select('id, section, type, kind, title, why, details, recommendation, sources, anime, confidence, rank, created_at, state')
            .in('state', ['new', 'acted']).gt('expires_at', nowIso)
            .order('rank', { ascending: true }).limit(40),
        manualGate().catch(() => ({ allowed: false, usedToday: 0, limit: 3 } as Awaited<ReturnType<typeof manualGate>>)),
        viewsDigest().then((v) => v.views).catch(() => ({} as Record<string, any>)),
        tableCount('release_radar'),
        tableCount('wire_items'),
        supabaseAdmin.from('explore_insights').select('id', { count: 'exact', head: true }).eq('state', 'acted').gte('state_at', weekAgo),
        supabaseAdmin.from('explore_insights').select('section, type').eq('state', 'dismissed').gte('state_at', weekAgo).limit(200),
        supabaseAdmin.from('explore_runs').select('digest_stats').in('status', ['ok', 'partial']).order('started_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const rows = (insRes.data || []) as (InsightRow & { state: 'new' | 'acted' })[];
    const posters = await posterMap(rows).catch(() => new Map<string, string>());
    const withVisual = (r: (typeof rows)[number]): FeedItem => ({ ...r, poster: posters.get(r.id) ?? null, tile: tileFor(r) });
    const feed = orderFeed(rows.filter((r) => r.section === 'world').map(withVisual), rows.filter((r) => r.section === 'ours').map(withVisual));
    const systemCards = rows.filter((r) => r.section === 'system');

    const hasKey = exploreConfig.hasKey();
    const enabled = exploreConfig.enabled();
    const lastGood = rows.length ? rows.reduce((m, r) => (r.created_at > m ? r.created_at : m), rows[0].created_at) : null;
    const statusLine = !enabled
        ? 'AI Insights is switched off'
        : !hasKey
            ? 'Claude is not connected yet'
            : lastGood
                ? `Updated ${fmtTime(lastGood)} · next at ${fmtTime(nextCronIso())}`
                : `First read at ${fmtTime(nextCronIso())}`;

    // Rail: views share (deterministic, daily_views), topics in the live feed, dismissals this week.
    const shares: ViewShare[] = ['threads', 'instagram', 'website', 'x']
        .filter((p) => views[p]?.week)
        .map((p) => ({ platform: p, label: PN[p], views: Number(views[p].week.last_7d) || 0 }))
        .sort((a, b) => b.views - a.views);
    const through = (Object.values(views).map((v: any) => v?.data_through).filter(Boolean)[0] as string | undefined) ?? null;
    const topicCount = (label: string) => feed.filter((f) => topicOf(f) === label).length;
    const topics = [
        { label: 'Premieres', count: topicCount('Premieres'), tone: 'premiere' },
        { label: 'News', count: topicCount('News'), tone: 'news' },
        { label: 'Our numbers', count: topicCount('Our numbers'), tone: 'ours' },
    ];
    const dismissedBy = new Map<string, number>();
    for (const d of (dismissedRes.data || []) as Pick<InsightRow, 'section' | 'type'>[]) {
        const t = topicOf(d);
        dismissedBy.set(t, (dismissedBy.get(t) ?? 0) + 1);
    }
    const topDismissed = [...dismissedBy.entries()].sort((a, b) => b[1] - a[1])[0];
    const note = topDismissed
        ? `You dismissed ${topDismissed[1]} ${TOPIC_NOTE[topDismissed[0]]} insight${topDismissed[1] === 1 ? '' : 's'} this week. Claude skips similar ones in the next reads.`
        : null;

    const missing = new Set<string>();
    const stats = (lastRunRes.data?.digest_stats || {}) as Record<string, { missing?: string[] }>;
    for (const s of Object.values(stats)) for (const m of s?.missing || []) missing.add(m);

    const empty = !hasKey || !enabled
        ? { title: 'Connect Claude to see insights', line: 'Cards appear here after the Claude key is added.' }
        : radarCount + wireCount === 0
            ? { title: 'Data is still filling in', line: 'Release Radar and the Wire are collecting. The first read follows.' }
            : { title: 'Nothing worth your time right now', line: 'Claude found nothing strong enough to flag in the last read.' };

    return (
        <div className="ak-ai">
            <header className="ak-ai__head">
                <div className="min-w-0">
                    <h1 className="ak-ai__title">AI Insights</h1>
                    <div className="ak-ai__status">{statusLine}</div>
                </div>
                <div className="ak-ai__headr">
                    <Suspense fallback={<SystemPillFallback />}>
                        <SystemPillLoader systemCards={systemCards} />
                    </Suspense>
                    <RegenerateButton hasKey={hasKey} enabled={enabled} allowed={gate.allowed} reason={gate.reason ?? null} nextAt={gate.nextAt ?? null} />
                </div>
            </header>

            <div className="ak-ai__grid">
                <div className="ak-ai__stats">
                    <WeekStats
                        insights={feed.length}
                        needsYou={<Suspense fallback={<span className="ak-ai-tile__wait">·</span>}><NeedsYouCount /></Suspense>}
                        acted={actedRes.count ?? 0}
                    />
                </div>

                <div className="ak-ai__main">
                    <InsightsFeed items={feed} now={now} empty={empty} footnote={missing.size > 0 ? `Not available in the last read: ${[...missing].join(', ')}` : null} />
                </div>

                <div className="ak-ai__brk">
                    <WeekBreakdown shares={shares} through={through} topics={topics} note={note} />
                </div>
            </div>
        </div>
    );
}
