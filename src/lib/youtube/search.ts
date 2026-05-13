/**
 * youtube/search.ts
 *
 * Operator-facing YouTube search used by the "Find Video" scrape flow on
 * the admin dashboard. Given a free-text query plus the originating
 * post's claim_type + timestamp, returns a ranked list of YouTube video
 * candidates with risk flags the operator can use to override the
 * pre-selected top pick.
 *
 * Backend: calls the kumolab-yt-dlp-worker's POST /search endpoint
 * (yt-dlp's `ytsearchN:` driver). Goes through the same Webshare proxy
 * chain as the /download path, so no YouTube Data API quota or key is
 * needed. The worker returns full metadata per result (title, channel,
 * duration, view count, upload_date, thumbnail).
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

// Channels we strongly trust as official anime / distributor sources.
// Matched against the lowercased channelTitle returned by the worker.
// The list is intentionally small + curated — false positives here
// would auto-elevate fan re-uploads with the same channel name.
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

// Channel names come back from yt-dlp with locale suffixes — "TOHO
// animation チャンネル" instead of plain "TOHO animation", or
// "Crunchyroll Anime" instead of "Crunchyroll". Match the allowlist
// entry against the start of the lowercased channel title with a
// word-boundary check on the following character so prefixes are
// honored without false-positive substring matches.
function isOfficialChannel(lcChannel: string): boolean {
    for (const name of OFFICIAL_CHANNEL_TITLES) {
        if (lcChannel === name) return true;
        if (!lcChannel.startsWith(name)) continue;
        const next = lcChannel[name.length];
        // No trailing char (exact) or non-word char (space, punctuation,
        // non-ASCII like the JP チ) → official; another letter/digit
        // means we matched a prefix of a longer unrelated name.
        if (!next || /[^a-z0-9]/i.test(next)) return true;
    }
    return false;
}

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

interface WorkerSearchItem {
    videoId: string;
    title: string;
    channelTitle: string;
    channelId: string;
    durationSeconds: number;
    viewCount: number;
    publishedAt: string;
    thumbnailUrl: string;
}

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const r = seconds % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
}

function workerEnv(): { url: string; secret: string } | null {
    const url = process.env.YT_WORKER_URL;
    const secret = process.env.YT_WORKER_SECRET;
    if (!url || !secret) return null;
    return { url: url.replace(/\/$/, ''), secret };
}

async function workerSearch(
    query: string,
    maxResults: number,
): Promise<{ ok: true; items: WorkerSearchItem[] } | { ok: false; error: string }> {
    const worker = workerEnv();
    if (!worker) return { ok: false, error: 'YT_WORKER_URL / YT_WORKER_SECRET not configured' };

    // Cold-start tolerance: the worker can sleep up to 60s on Render's
    // free tier. We retry once on AbortError after a 3s warmup like the
    // download path does.
    const callOnce = async (): Promise<{ ok: true; items: WorkerSearchItem[] } | { ok: false; err: string }> => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 90_000);
        try {
            const r = await fetch(`${worker.url}/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${worker.secret}`,
                },
                body: JSON.stringify({ query, maxResults }),
                signal: ctrl.signal,
            });
            if (!r.ok) {
                const detail = (await r.text().catch(() => '')).slice(0, 300);
                return { ok: false, err: `HTTP ${r.status}: ${detail}` };
            }
            const j: any = await r.json();
            return { ok: true, items: (j?.items ?? []) as WorkerSearchItem[] };
        } catch (e: any) {
            return { ok: false, err: (e?.message || e).toString() };
        } finally {
            clearTimeout(timer);
        }
    };

    let res = await callOnce();
    if (!res.ok && /abort/i.test(res.err)) {
        await new Promise((r) => setTimeout(r, 3_000));
        res = await callOnce();
    }
    if (!res.ok) return { ok: false, error: `worker /search failed: ${res.err}` };
    return { ok: true, items: res.items };
}

export async function searchYouTube(
    query: string,
    options: { claimType?: string | null; postPublishedAt?: string | null; maxResults?: number } = {},
): Promise<{ ok: true; candidates: YouTubeCandidate[] } | { ok: false; error: string }> {
    const q = query.trim();
    if (!q) return { ok: false, error: 'Query is empty' };

    const maxResults = Math.min(Math.max(options.maxResults ?? 10, 5), 15);

    const res = await workerSearch(q, maxResults);
    if (!res.ok) return { ok: false, error: res.error };
    if (res.items.length === 0) return { ok: true, candidates: [] };

    const queryDetectsOpEd = OP_ED_PATTERN.test(q);
    const claimType = (options.claimType || 'OTHER').toUpperCase();
    const baseWindow = DURATION_WINDOWS[claimType] || DURATION_WINDOWS.OTHER;
    const window: [number, number] = queryDetectsOpEd ? OP_ED_WINDOW : baseWindow;

    const postTime = options.postPublishedAt
        ? new Date(options.postPublishedAt).getTime()
        : Date.now();

    const candidates: YouTubeCandidate[] = res.items.map((v) => {
        const lcTitle = v.title.toLowerCase();
        const lcChannel = v.channelTitle.toLowerCase();

        const pros: string[] = [];
        const risks: CandidateRisk[] = [];

        const isOfficial = isOfficialChannel(lcChannel);
        if (isOfficial) pros.push('Official channel');

        const inDurationWindow = v.durationSeconds >= window[0] && v.durationSeconds <= window[1];
        if (inDurationWindow) {
            pros.push('Duration fits');
        } else if (v.durationSeconds > window[1]) {
            risks.push({
                type: 'warn',
                label: `Long video (${formatDuration(v.durationSeconds)} > ${formatDuration(window[1])})`,
            });
        } else if (v.durationSeconds > 0) {
            risks.push({
                type: 'warn',
                label: `Short video (${formatDuration(v.durationSeconds)} < ${formatDuration(window[0])})`,
            });
        }

        if (REACTION_PATTERN.test(lcTitle)) {
            risks.push({ type: 'bad', label: 'Reaction / review content' });
        }
        if (COMPILATION_PATTERN.test(lcTitle)) {
            risks.push({ type: 'bad', label: 'Compilation / recap content' });
        }

        const ageDays = v.publishedAt
            ? Math.abs(postTime - new Date(v.publishedAt).getTime()) / (24 * 3600 * 1000)
            : Infinity;
        const recentBonus = ageDays < 14;
        if (recentBonus) pros.push('Recent upload');

        if (v.durationSeconds > WORKER_HARD_CAP_SECONDS) {
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
        if (v.durationSeconds > WORKER_HARD_CAP_SECONDS) score -= 150;
        score += Math.log10(Math.max(v.viewCount, 1)) * 2;

        return {
            videoId: v.videoId,
            url: `https://www.youtube.com/watch?v=${v.videoId}`,
            title: v.title,
            channelTitle: v.channelTitle,
            channelId: v.channelId,
            durationSeconds: v.durationSeconds,
            durationText: v.durationSeconds > 0 ? formatDuration(v.durationSeconds) : '—',
            viewCount: v.viewCount,
            publishedAt: v.publishedAt,
            thumbnailUrl: v.thumbnailUrl,
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
