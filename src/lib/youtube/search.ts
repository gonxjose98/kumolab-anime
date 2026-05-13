/**
 * youtube/search.ts
 *
 * Operator-facing YouTube search used by the "Find Video" scrape flow on
 * the admin dashboard. Given a free-text query plus the originating
 * post's claim_type + timestamp, returns a ranked list of YouTube video
 * candidates with risk flags the operator can use to override the
 * pre-selected top pick.
 *
 * Ranking signals:
 *   + Official-channel match (curated allowlist of anime distributors/studios)
 *   + Duration fits the claim-type window (or the OP/ED override window)
 *   + Recency relative to the post's publish time
 *   + view-count log as tiebreaker
 *   - Reaction / review / breakdown titles
 *   - Compilation / recap titles
 *   - Duration over the yt-dlp worker's hard cap (300s) — guarantees failure
 *
 * No filtering: even bad candidates appear in the list (with ✗ flags) so
 * the operator can still pick them when there's nothing better.
 */

const API_KEY = process.env.YOUTUBE_API_KEY || '';
const API_BASE = 'https://www.googleapis.com/youtube/v3';

// Channels we strongly trust as official anime / distributor sources.
// Matched against the lowercased channelTitle returned by YouTube. The
// list is intentionally small + curated — false positives here would
// auto-elevate fan re-uploads with the same channel name.
const OFFICIAL_CHANNEL_TITLES = new Set<string>([
    'aniplex usa',
    'aniplex of america',
    'aniplexus',
    'aniplex',
    'crunchyroll',
    'crunchyroll collection',
    'crunchyroll dubs',
    'sentai filmworks',
    'hidive',
    'funimation',
    'toho animation',
    'kadokawa anime',
    'kadokawaanime',
    'mappa',
    'ufotable',
    'wit studio',
    'witstudio',
    'bandai namco filmworks',
    'a-1 pictures',
    'studio bones',
    'studio trigger',
    'cloverworks',
    'madhouse',
    'anime expo',
    'shonen jump',
    'viz media',
    'netflix anime',
]);

const REACTION_PATTERN = /\b(reaction|reacting|reacts?|first time|breakdown|reviewing|explained|theory|theories|analyzing|analysed|analyzed)\b/i;
const COMPILATION_PATTERN = /\b(compilation|every (?:scene|moment|opening)|recap|summary|all (?:the )?openings?)\b/i;
const OP_ED_PATTERN = /\b(opening|op\s*\d?|ending|ed\s*\d?|theme song)\b/i;

// Hard cap of the yt-dlp worker download path. Anything beyond this is
// guaranteed to fail at fetch time so we flag it with a 'bad' risk.
const WORKER_HARD_CAP_SECONDS = 300;

const DURATION_WINDOWS: Record<string, [number, number]> = {
    TRAILER_DROP: [15, 240],
    NEW_KEY_VISUAL: [5, 120],
    NEW_SEASON_CONFIRMED: [10, 240],
    DATE_ANNOUNCED: [10, 180],
    DELAY: [5, 180],
    CAST_ADDITION: [5, 180],
    STAFF_UPDATE: [5, 180],
    OTHER: [5, 300],
};

// OP/ED override: when the query explicitly mentions opening/ending/OP/ED,
// switch to the TV-spot duration window regardless of the post's claim_type.
const OP_ED_WINDOW: [number, number] = [60, 130];

export type CandidateRiskType = 'ok' | 'warn' | 'bad';

export interface CandidateRisk {
    type: CandidateRiskType;
    label: string;
}

export interface YouTubeCandidate {
    videoId: string;
    url: string;
    title: string;
    channelTitle: string;
    channelId: string;
    durationSeconds: number;
    durationText: string;
    viewCount: number;
    publishedAt: string;
    thumbnailUrl: string;
    score: number;
    pros: string[];
    risks: CandidateRisk[];
}

function parseISO8601Duration(iso: string): number {
    if (!iso) return 0;
    const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!m) return 0;
    return (parseInt(m[1] || '0', 10) * 3600) + (parseInt(m[2] || '0', 10) * 60) + parseInt(m[3] || '0', 10);
}

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const r = seconds % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
}

export async function searchYouTube(
    query: string,
    options: { claimType?: string | null; postPublishedAt?: string | null; maxResults?: number } = {},
): Promise<{ ok: true; candidates: YouTubeCandidate[] } | { ok: false; error: string }> {
    if (!API_KEY) return { ok: false, error: 'YOUTUBE_API_KEY not configured' };
    const q = query.trim();
    if (!q) return { ok: false, error: 'Query is empty' };

    const maxResults = Math.min(Math.max(options.maxResults ?? 10, 5), 15);

    // 1. search.list — IDs only; videos.list gives us the real metadata.
    const searchUrl =
        `${API_BASE}/search?part=snippet&type=video&maxResults=${maxResults}` +
        `&q=${encodeURIComponent(q)}&order=relevance&safeSearch=none&key=${API_KEY}`;

    let searchRes: Response;
    try {
        searchRes = await fetch(searchUrl, { cache: 'no-store' });
    } catch (e: any) {
        return { ok: false, error: `YouTube search fetch failed: ${e?.message || e}` };
    }
    if (!searchRes.ok) {
        const body = await searchRes.text().catch(() => '');
        return { ok: false, error: `YouTube search HTTP ${searchRes.status}: ${body.slice(0, 200)}` };
    }
    const searchJson: any = await searchRes.json().catch(() => null);
    const items: any[] = searchJson?.items || [];
    const ids = items.map((i) => i?.id?.videoId).filter(Boolean) as string[];
    if (ids.length === 0) return { ok: true, candidates: [] };

    // 2. videos.list — duration + view count + channel + snippet.
    const videosUrl =
        `${API_BASE}/videos?part=contentDetails,statistics,snippet` +
        `&id=${ids.join(',')}&key=${API_KEY}`;
    let videosRes: Response;
    try {
        videosRes = await fetch(videosUrl, { cache: 'no-store' });
    } catch (e: any) {
        return { ok: false, error: `YouTube videos fetch failed: ${e?.message || e}` };
    }
    if (!videosRes.ok) {
        const body = await videosRes.text().catch(() => '');
        return { ok: false, error: `YouTube videos HTTP ${videosRes.status}: ${body.slice(0, 200)}` };
    }
    const videosJson: any = await videosRes.json().catch(() => null);
    const vItems: any[] = videosJson?.items || [];

    const queryDetectsOpEd = OP_ED_PATTERN.test(q);
    const claimType = (options.claimType || 'OTHER').toUpperCase();
    const baseWindow = DURATION_WINDOWS[claimType] || DURATION_WINDOWS.OTHER;
    const window: [number, number] = queryDetectsOpEd ? OP_ED_WINDOW : baseWindow;

    const postTime = options.postPublishedAt
        ? new Date(options.postPublishedAt).getTime()
        : Date.now();

    const candidates: YouTubeCandidate[] = vItems.map((v: any) => {
        const videoId: string = v.id;
        const title: string = v.snippet?.title || '';
        const channelTitle: string = v.snippet?.channelTitle || '';
        const channelId: string = v.snippet?.channelId || '';
        const publishedAt: string = v.snippet?.publishedAt || '';
        const thumbnailUrl: string =
            v.snippet?.thumbnails?.medium?.url ||
            v.snippet?.thumbnails?.default?.url ||
            '';
        const durationSeconds = parseISO8601Duration(v.contentDetails?.duration || '');
        const viewCount = parseInt(v.statistics?.viewCount || '0', 10);

        const lcTitle = title.toLowerCase();
        const lcChannel = channelTitle.toLowerCase();

        const pros: string[] = [];
        const risks: CandidateRisk[] = [];

        const isOfficial = OFFICIAL_CHANNEL_TITLES.has(lcChannel);
        if (isOfficial) pros.push('Official channel');

        const inDurationWindow = durationSeconds >= window[0] && durationSeconds <= window[1];
        if (inDurationWindow) {
            pros.push('Duration fits');
        } else if (durationSeconds > window[1]) {
            risks.push({
                type: 'warn',
                label: `Long video (${formatDuration(durationSeconds)} > ${formatDuration(window[1])})`,
            });
        } else if (durationSeconds > 0) {
            risks.push({
                type: 'warn',
                label: `Short video (${formatDuration(durationSeconds)} < ${formatDuration(window[0])})`,
            });
        }

        if (REACTION_PATTERN.test(lcTitle)) {
            risks.push({ type: 'bad', label: 'Reaction / review content' });
        }
        if (COMPILATION_PATTERN.test(lcTitle)) {
            risks.push({ type: 'bad', label: 'Compilation / recap content' });
        }

        const ageDays = publishedAt
            ? Math.abs(postTime - new Date(publishedAt).getTime()) / (24 * 3600 * 1000)
            : Infinity;
        const recentBonus = ageDays < 14;
        if (recentBonus) pros.push('Recent upload');

        if (durationSeconds > WORKER_HARD_CAP_SECONDS) {
            risks.push({
                type: 'bad',
                label: `Too long for worker (>${formatDuration(WORKER_HARD_CAP_SECONDS)})`,
            });
        }

        let score = 0;
        if (isOfficial) score += 100;
        if (inDurationWindow) score += 30;
        if (recentBonus) score += 20;
        if (REACTION_PATTERN.test(lcTitle)) score -= 80;
        if (COMPILATION_PATTERN.test(lcTitle)) score -= 50;
        if (durationSeconds > WORKER_HARD_CAP_SECONDS) score -= 150;
        score += Math.log10(Math.max(viewCount, 1)) * 2;

        return {
            videoId,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title,
            channelTitle,
            channelId,
            durationSeconds,
            durationText: durationSeconds > 0 ? formatDuration(durationSeconds) : '—',
            viewCount,
            publishedAt,
            thumbnailUrl,
            score,
            pros,
            risks,
        };
    });

    candidates.sort((a, b) => b.score - a.score);

    // Trim to top 6 — enough variety for an operator to choose from
    // without overwhelming the modal.
    return { ok: true, candidates: candidates.slice(0, 6) };
}
