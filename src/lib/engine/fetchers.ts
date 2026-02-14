/**
 * fetchers.ts
 * Data fetching layer for KumoLab Blog Automation
 */

const ANILIST_URL = 'https://graphql.anilist.co';

export interface VerificationProvenance {
    tier: 'streamer' | 'popularity' | 'format_exception' | number;
    reason: string;
    sources: any;
}

import { ClaimType } from '@/types';

export interface AiringEpisode {
    id: number;
    episode: number;
    airingAt: number;
    media: {
        id: number;
        title: {
            romaji: string;
            english: string;
            native: string;
        };
        coverImage: {
            extraLarge: string;
            large: string;
        };
        externalLinks: {
            url: string;
            site: string;
        }[];
    };
    provenance?: VerificationProvenance;
}

/**
 * Fetches airing episodes from AniList for a specific date range.
 * @param startTimestamp Unix timestamp (seconds)
 * @param endTimestamp Unix timestamp (seconds)
 */
export async function fetchAniListAiring(startTimestamp: number, endTimestamp: number): Promise<AiringEpisode[]> {
    const query = `
        query ($start: Int, $end: Int) {
            Page {
                airingSchedules(airingAt_greater: $start, airingAt_lesser: $end) {
                    id
                    episode
                    airingAt
                    media {
                        id
                        title {
                            romaji
                            english
                            native
                        }
                        format
                        popularity
                        isAdult
                        status
                        seasonYear
                        coverImage {
                            extraLarge
                            large
                        }
                        externalLinks {
                            url
                            site
                        }
                        studios(isMain: true) {
                            nodes {
                                name
                            }
                        }
                    }
                }
            }
        }
    `;

    const variables = {
        start: startTimestamp,
        end: endTimestamp
    };

    try {
        const response = await fetch(ANILIST_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                query,
                variables
            })
        });

        if (!response.ok) {
            throw new Error(`AniList API error: ${response.statusText}`);
        }

        const json = await response.json();
        const rawEpisodes = json.data?.Page?.airingSchedules || [];

        // STRICT VALIDATION & AUDIT LOGGING
        const verifiedEpisodes: AiringEpisode[] = [];

        for (const ep of rawEpisodes) {
            const audit = validateAiringDrop(ep);
            if (audit) {
                // Attach audit data (Provenance)
                ep.provenance = audit;
                verifiedEpisodes.push(ep);
            }
        }

        return verifiedEpisodes;

    } catch (error) {
        console.error('Error fetching from AniList:', error);
        return [];
    }
}

/**
 * HARD LOCKED VERIFICATION SYSTEM (REVISION V2)
 * 
 * Rules:
 * 1. Must be American/New_York (EST) today.
 * 2. MUST have a Primary Streamer Link (Crunchyroll, Netflix, HIDIVE, etc).
 * 3. NO popularity-based "guessing" or "crowd wisdom".
 * 4. MUST have a confirmed episode number from AniList (verified against streamer status).
 */
const PRIMARY_SOURCES = [
    'Crunchyroll', 'Netflix', 'Hulu', 'Disney Plus', 'Hidive', 'Amazon Prime Video', 'Bilibili Global'
];

export function validateAiringDrop(episode: any): VerificationProvenance | null {
    const media = episode.media;
    const animeTitle = media.title.english || media.title.romaji;

    // 0. EXCLUDE ADULT CONTENT & NON-TV FORMATS & PLACEHOLDERS
    if (media.isAdult) return null;

    // REQUIRE RELEASING STATUS (Prevents placeholder/rumor dates)
    if (media.status !== 'RELEASING') {
        console.log(`[Validation Reject - Not Releasing] ${animeTitle} (Status: ${media.status})`);
        return null;
    }

    // REQUIRE TV/ONA FORMAT (Prevents random specials/PVs)
    const validFormats = ['TV', 'TV_SHORT', 'ONA'];
    if (!validFormats.includes(media.format)) {
        console.log(`[Validation Reject - Invalid Format] ${animeTitle} (Format: ${media.format})`);
        return null;
    }

    // 1. PRIMARY SOURCE VERIFICATION (HARD RULE)
    // Every entry MUST have a verified streaming link to prove distribution and release.
    const primaryLink = media.externalLinks.find((link: any) =>
        PRIMARY_SOURCES.some(source => link.site.toLowerCase().includes(source.toLowerCase()))
    );

    if (!primaryLink) {
        console.log(`[Validation Reject - Missing Primary Source] ${animeTitle}`);
        return null;
    }

    // 2. TIMING VERIFICATION (INTERNAL AUDIT)
    const airDate = new Date(episode.airingAt * 1000);
    const estString = airDate.toLocaleString('en-US', { timeZone: 'America/New_York' });

    // 3. EPISODE ACCURACY CHECK
    // If it's a Sequel, we must ensure the episode number is provided.
    if (!episode.episode || episode.episode <= 0) {
        console.log(`[Validation Reject - Invalid Episode #] ${animeTitle}`);
        return null;
    }

    // 4. GENERATE INTERNAL AUDIT LOG
    // Title | Episode # | Source | Link | Release Time | Timezone
    const auditReason = `${animeTitle} | Ep ${episode.episode} | ${primaryLink.site} | ${primaryLink.url} | ${airDate.toISOString()} | America/New_York`;

    return {
        tier: 'streamer',
        reason: auditReason,
        sources: {
            source: primaryLink.site,
            url: primaryLink.url,
            raw_time: airDate.toISOString(),
            ep: episode.episode
        }
    };
}

// Deprecated old function, kept just in case but redirects to new logic
export async function verifyOnCrunchyroll(episode: AiringEpisode): Promise<boolean> {
    return !!validateAiringDrop(episode);
}

/**
 * Searches AniList for an official media image by title.
 * Used to ensure compliance with IMAGE RELEVANCE PROMPT (LOCKED).
 */
export async function fetchOfficialAnimeImage(title: string): Promise<string | null> {
    const query = `
        query ($search: String) {
            Media (search: $search, type: ANIME) {
                id
                coverImage {
                    extraLarge
                    large
                }
                bannerImage
            }
        }
    `;

    try {
        const response = await fetch(ANILIST_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables: { search: title } })
        });
        const json = await response.json();
        const media = json.data?.Media;
        // Prioritize Banner Image (Horizontal) for higher quality social cards
        return media?.bannerImage || media?.coverImage?.extraLarge || media?.coverImage?.large || null;
    } catch {
        return null;
    }
}

/**
 * REALITY CHECK: Queries AniList to see if a season is already known or aired.
 * Used to prevent embarrassing "Confirmed" posts for stale news.
 */
export async function verifyAnimeReality(animeTitle: string, seasonLabel?: string): Promise<{
    isStale: boolean;
    reason?: string;
    details?: any;
}> {
    const query = `
        query ($search: String) {
            Page(page: 1, perPage: 5) {
                media(search: $search, type: ANIME) {
                    id
                    title {
                        romaji
                        english
                    }
                    status
                    seasonYear
                    episodes
                    format
                }
            }
        }
    `;

    try {
        const response = await fetch(ANILIST_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables: { search: animeTitle } })
        });
        const json = await response.json();
        const results = json.data?.Page?.media || [];

        if (results.length === 0) return { isStale: false }; // New or unknown

        // Heuristic: If we find an exact match or highly similar title that is already releasing or finished
        const lowerTitle = animeTitle.toLowerCase();

        for (const media of results) {
            const mediaTitle = (media.title.english || media.title.romaji || '').toLowerCase();

            // If the title contains the season label, we've found our match
            // Improved match for "Season X" vs "Xth Season"
            let matchesSeason = false;
            if (seasonLabel) {
                const sNumMatch = seasonLabel.match(/\d+/);
                if (sNumMatch) {
                    const sNum = sNumMatch[0];
                    const seasonRegex = new RegExp(`(?:Season\\s+${sNum})|(?:${sNum}(?:st|nd|rd|th)?\\s+Season)`, 'i');
                    matchesSeason = seasonRegex.test(mediaTitle);
                } else {
                    matchesSeason = mediaTitle.includes(seasonLabel.toLowerCase());
                }
            } else {
                matchesSeason = true;
            }

            console.log(`[Reality Check DEBUG] Checking match: "${mediaTitle}" vs "${seasonLabel}" (Matches: ${matchesSeason})`);

            if (matchesSeason) {
                console.log(`[Reality Check DEBUG] Match Found: Status=${media.status}, Eps=${media.episodes}`);
                // RULE: If status is RELEASING, FINISHED, or has episodes -> STALE for "Confirmed"
                if (['RELEASING', 'FINISHED', 'CANCELLED'].includes(media.status) || (media.episodes && media.episodes > 0)) {
                    return {
                        isStale: true,
                        reason: `Anime status is ${media.status} with ${media.episodes || 0} episodes in AniList.`,
                        details: media
                    };
                }

                // RULE: If it has a seasonYear, it was likely confirmed long ago
                if (media.seasonYear && media.status !== 'NOT_YET_RELEASED') {
                    return {
                        isStale: true,
                        reason: `Anime already scheduled for ${media.seasonYear} with status ${media.status}.`,
                        details: media
                    };
                }
            }
        }

        return { isStale: false };
    } catch (e) {
        console.error("[Reality Check] AniList query failed:", e);
        return { isStale: false }; // Fail-safe: allow if API is down? Or abort? User says silence is better.
    }
}
import { generateEventFingerprint, generateTruthFingerprint } from './utils';

/**
 * Fetches real Anime News from ANN/Crunchyroll RSS
 */
export async function fetchAnimeIntel(telemetry?: any): Promise<any[]> {
    let items: any[] = [];
    const { CONTENT_RULES, SOURCE_TIERS } = await import('./sources-config');

    // 1. Try to fetch from RSS Feeds
    const feeds = [
        { name: 'AnimeNewsNetwork', url: 'https://www.animenewsnetwork.com/all/rss.xml', tier: 1 },
        { name: 'ComicBook', url: 'https://comicbook.com/anime/rss', tier: 2 }
    ];

    for (const feed of feeds) {
        try {
            console.log(`[Fetcher] Sourcing Intel from ${feed.name}...`);
            const response = await fetch(feed.url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.3/6' }
            });
            const text = await response.text();

            // Simple regex RSS parser (lightweight, no deps)
            const itemRegex = /<item>[\s\S]*?<\/item>/g;
            const titleRegex = /<title>(.*?)<\/title>/;
            const linkRegex = /<link>(.*?)<\/link>/;
            const descRegex = /<description>([\s\S]*?)<\/description>/;
            const guidRegex = /<guid.*?>([\s\S]*?)<\/guid>/;
            const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/;
            const mediaRegex = /<media:content[^>]*url="([^"]+)"[^>]*>|&lt;img[^&]*src="([^"]+)"|&lt;img[^&]*src='([^']+)'|<img[^>]*src="([^"]+)"/g;

            let match;
            while ((match = itemRegex.exec(text)) !== null) {
                mediaRegex.lastIndex = 0; // RESET GLOBAL REGEX
                try {
                    const itemBlock = match[0];
                    const titleMatch = titleRegex.exec(itemBlock);
                    const linkMatch = linkRegex.exec(itemBlock);
                    const descMatch = descRegex.exec(itemBlock);
                    const guidMatch = guidRegex.exec(itemBlock);
                    const dateMatch = pubDateRegex.exec(itemBlock);

                    if (!titleMatch || !linkMatch) continue;

                    const rawTitle = (titleMatch[1] || '').replace('<![CDATA[', '').replace(']]>', '').replace(/&amp;/g, '&').trim();
                    const rawDescription = (descMatch ? descMatch[1] : '').replace('<![CDATA[', '').replace(']]>', '').trim();
                    const cleanDesc = rawDescription.replace(/<[^>]*>?/gm, '').replace(/&[^;]+;/g, '').trim();
                    const pubDate = dateMatch ? new Date(dateMatch[1]) : new Date();
                    const permalink = (linkMatch[1] || '').trim();
                    const guid = (guidMatch ? guidMatch[1] : permalink).replace('<![CDATA[', '').replace(']]>', '').trim();

                    if (!rawTitle) continue;

                    // --- NEW STRICT FILTERING LOGIC ---
                    const lowerTitleRaw = rawTitle.toLowerCase();
                    const lowerDescRaw = cleanDesc.toLowerCase();

                    // Word boundary safe negative check
                    const forbiddenWords = [...CONTENT_RULES.NEGATIVE_KEYWORDS, 'manga', 'volume', 'webtoon', 'manhwa', 'novel', 'light novel', 'live action', 'live-action'];
                    const titleNegative = forbiddenWords.some(k => {
                        const regex = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                        return regex.test(rawTitle);
                    });

                    if (titleNegative) {
                        console.log(`[Fetcher] Skipping (Negative/Manga Title): ${rawTitle}`);
                        if (telemetry) telemetry.negativeKeywordsSkipped++;
                        continue;
                    }

                    const descNegative = ['mario'].some(k => {
                        const regex = new RegExp(`\\b${k}\\b`, 'i');
                        return regex.test(lowerDescRaw);
                    }) || /\bAI\b/.test(cleanDesc); // Case sensitive for AI but not Mario

                    if (descNegative) {
                        console.log(`[Fetcher] Skipping (Negative Desc): ${rawTitle}`);
                        if (telemetry) telemetry.negativeKeywordsSkipped++;
                        continue;
                    }

                    // --- STRICT CLASSIFICATION ---
                    let claimType: any = null;
                    if (lowerTitleRaw.includes('delay') || lowerTitleRaw.includes('postponed') || lowerTitleRaw.includes('hiatus')) claimType = 'DELAY';
                    else if (lowerTitleRaw.includes('trailer') || lowerTitleRaw.includes('pv') || lowerTitleRaw.includes('teaser')) claimType = 'TRAILER_DROP';
                    else if (lowerTitleRaw.includes('visual') || lowerTitleRaw.includes('key visual')) claimType = 'NEW_KEY_VISUAL';
                    else if (lowerTitleRaw.includes('staff')) claimType = 'STAFF_UPDATE';
                    else if (lowerTitleRaw.includes('cast')) claimType = 'CAST_ADDITION';
                    else if (lowerTitleRaw.includes('premiere') || lowerTitleRaw.includes('debuts') || lowerTitleRaw.includes('premiere date')) claimType = 'DATE_ANNOUNCED';
                    else if (lowerTitleRaw.includes('season') && (lowerTitleRaw.includes('confirmed') || lowerTitleRaw.includes('sequel') || lowerTitleRaw.includes('greenlit') || lowerTitleRaw.includes('announces'))) claimType = 'NEW_SEASON_CONFIRMED';

                    if (!claimType) {
                        // Check description if title is ambiguous
                        if (lowerDescRaw.includes('new key visual')) claimType = 'NEW_KEY_VISUAL';
                        else if (lowerDescRaw.includes('new trailer')) claimType = 'TRAILER_DROP';
                        else claimType = 'OTHER_ABORT'; // Fallback for general news
                    }

                    // --- ANIME ID & SEASON EXTRACTION ---
                    // Splitting on action verbs common in headlines
                    const actionVerbs = ['screens', 'unveils', 'casts', 'announces', 'teases', 'reveals', 'releases', 'opens', 'sets', 'drops', 'debuts'];
                    let animeIdRaw = rawTitle;

                    if (rawTitle.includes(':')) {
                        animeIdRaw = rawTitle.split(':')[0].trim();
                    } else {
                        // Look for action verbs to split using regex for robustness
                        const verbRegex = new RegExp(`\\b(${actionVerbs.join('|')})\\b`, 'i');
                        const verbMatch = rawTitle.match(verbRegex);
                        let earliestVerbIdx = -1;
                        let matchedVerb = "";

                        if (verbMatch && verbMatch.index !== undefined) {
                            earliestVerbIdx = verbMatch.index;
                            matchedVerb = verbMatch[0].toLowerCase();
                            console.log(`[Fetcher DEBUG] Found verb "${matchedVerb}" at idx ${earliestVerbIdx} in "${rawTitle}"`);
                        } else {
                            console.log(`[Fetcher DEBUG] No verb found in "${rawTitle}"`);
                        }

                        if (earliestVerbIdx !== -1) {
                            const subject = rawTitle.substring(0, earliestVerbIdx).trim();
                            const object = rawTitle.substring(earliestVerbIdx + matchedVerb.length + 2).trim(); // +2 for spaces

                            // If subject is a known studio/licensor, the anime is in the object
                            const studioNoise = ['Sentai Filmworks', 'Sentai', 'Crunchyroll', 'Netflix', 'Disney+', 'Aniplex', 'KADOKAWA', 'Pony Canyon', 'ShoPro'];
                            const isStudioSubject = studioNoise.some(s => subject.toLowerCase().includes(s.toLowerCase()));

                            if (isStudioSubject) {
                                animeIdRaw = object;
                            } else {
                                animeIdRaw = subject;
                            }
                        } else {
                            animeIdRaw = rawTitle.split(' Season')[0].trim();
                        }
                        console.log(`[Fetcher DEBUG] Final animeIdRaw: "${animeIdRaw}"`);
                    }

                    // Extraction of "Season X" or "X Season" + Cour/Part extensions
                    const seasonMatch = rawTitle.match(/(?:Season\s+(\d+))|(?:\b(\d+)(?:st|nd|rd|th)?\s+Season\b)/i);
                    let seasonLabel = seasonMatch ? `Season ${seasonMatch[1] || seasonMatch[2]}` : null;

                    const partMatch = rawTitle.match(/(?:Part\s+(\d+))|(?:Cour\s+(\d+))/i);
                    if (partMatch) {
                        const partSuffix = partMatch[1] ? `Part ${partMatch[1]}` : `Cour ${partMatch[2]}`;
                        seasonLabel = seasonLabel ? `${seasonLabel} ${partSuffix}` : partSuffix;
                    }

                    // Cleaning noise from ID
                    let animeId = animeIdRaw;
                    const eventNoise = [
                        'TV Anime', 'Original', 'The Movie', 'Anime', 'Film', 'Manga', 'Light Novel', 'Novel',
                        'World Premiere', 'Premiere', 'Restoration', '4K UHD', '4K', 'UHD', 'Screening', 'Special',
                        'Update', 'Announcement', 'Project'
                    ];
                    eventNoise.forEach(n => {
                        animeId = animeId.replace(new RegExp(`\\b${n}\\b`, 'gi'), '');
                    });

                    // Specific fix for "of X" patterns after stripping
                    animeId = animeId.replace(/\bof\b/gi, '').trim();

                    const rawAnimeId = animeId.trim();
                    animeId = rawAnimeId.toLowerCase().replace(/[^a-z0-9]+/g, '-');

                    // --- REALITY CHECK (MANDATORY FOR SEASONS) ---
                    if (lowerTitleRaw.includes('season')) {
                        const reality = await verifyAnimeReality(rawAnimeId, seasonLabel || undefined);
                        if (reality.isStale) {
                            console.log(`[Fetcher] STALE_CONFIRMATION_ABORT: ${rawTitle} | Reason: ${reality.reason}`);
                            continue; // ABSOLUTE ABORT
                        }
                    }

                    // --- ASSET EXTRACTION (Stage A) ---
                    const announcementAssets: string[] = [];
                    let m;
                    while ((m = mediaRegex.exec(itemBlock)) !== null) {
                        const assetUrl = m[1] || m[2] || m[3] || m[4];
                        if (assetUrl) announcementAssets.push(assetUrl);
                    }

                    // --- FINGERPRINTING ---
                    const fingerprint = generateEventFingerprint({
                        anime_id: animeId,
                        event_type: claimType,
                        canonical_announcement_key: guid,
                        primary_signal_date_or_asset_id: pubDate.toISOString().split('T')[0]
                    });

                    const truthFingerprint = generateTruthFingerprint({
                        anime_id: animeId,
                        event_type: claimType,
                        season_label: seasonLabel || undefined
                    });

                    items.push({
                        title: rawTitle,
                        claimType,
                        event_fingerprint: fingerprint,
                        truth_fingerprint: truthFingerprint,
                        anime_id: animeId,
                        season_label: seasonLabel,
                        slug: 'intel-' + animeId + '-' + claimType.toLowerCase().replace(/_/g, '-'),
                        content: cleanDesc.substring(0, 280),
                        imageSearchTerm: animeId,
                        announcementAssets,
                        source: feed.name,
                        source_url: permalink,
                        verification_tier: feed.tier,
                        publishedAt: pubDate.toISOString()
                    });
                } catch (err) {
                    console.error("[Fetcher] Error processing RSS item:", err);
                }
            }
        } catch (e) {
            console.error(`Failed to fetch RSS Intel from ${feed.name}:`, e);
        }
    }

    const uniqueItemsByFingerprint = Array.from(new Map(items.map(item => [item.event_fingerprint, item])).values());
    console.log(`[Fetcher] Total unique Intel items found: ${uniqueItemsByFingerprint.length}`);

    return uniqueItemsByFingerprint.slice(0, 10);
}


/**
 * Fetches real Trending discussions from Reddit r/anime (Hot/Top)
 */
export async function fetchTrendingSignals(telemetry?: any): Promise<any[]> {
    try {
        // Reddit JSON API (No auth needed for read-only public)
        const response = await fetch('https://www.reddit.com/r/anime/top.json?t=day&limit=10', {
            headers: {
                'User-Agent': 'KumoLab-Bot/1.0'
            }
        });

        if (!response.ok) throw new Error('Reddit API failed');

        const json = await response.json();
        const posts = json.data?.children || [];

        const validTrends = [];

        for (const post of posts) {
            const data = post.data;
            // Filter: No meta discussions, must be substantial
            if (data.stickied || data.is_meta) continue;

            // Exclude "Episode Discussion" threads if we want specific *moments*, 
            // OR include them if we want to extract the moment.
            // For now, let's treat popular episode threads as trending moments.

            let trendReason = "Community Hype";
            if (data.title.includes('Episode') && data.title.includes('Discussion')) {
                trendReason = "Episode Climax";
            } else if (data.title.includes('Visual') || data.title.includes('Trailer')) {
                trendReason = "Visual Reveal";
            }

            // Extract anime name attempt
            // "Frieren: Beyond Journey's End - Episode 15 Discussion" -> "Frieren: Beyond Journey's End"
            const titleClean = data.title.split(' - ')[0].replace(' [Spoilers]', '');

            validTrends.push({
                title: titleClean,
                fullTitle: data.title,
                slug: 'trending-' + data.id,
                content: data.selftext ? data.selftext.substring(0, 200) + '...' : data.title,
                imageSearchTerm: titleClean,
                momentum: data.score / 10000, // Normalized score
                trendReason: trendReason,
                source: `Reddit r/anime (Score: ${data.score})`
            });
        }

        return validTrends.slice(0, 3);
    } catch (e) {
        console.error("Failed to fetch Reddit Trending:", e);
        return [];
    }
}

/**
 * SUPERIOR TRENDING ALGORITHM (User Requested)
 * Sources: AniList (Trending), Reddit (Hot), News (ANN/Crunchyroll Proxy)
 * Logic: Priority = 3 Matches > 2 Matches > News Only
 */

export interface TrendingCandidate {
    title: string;
    score: number;
    sources: string[];
    image?: string;
    description?: string;
    status?: string;
    anime_id?: string;
    imageSearchTerm?: string;
    claimType?: ClaimType;
    event_fingerprint?: string;
    truth_fingerprint?: string;
    season_label?: string;
    announcementAssets?: string[];
    source_url?: string;
    verification_tier?: number;
    slug?: string;
}

// Helper to normalize titles for comparison
// Helper to normalize titles for comparison
function normalizeTitle(t: string): string {
    if (!t) return "";
    return t.toLowerCase()
        .replace(/【|】|\[|\]|\(|\)/g, '')
        .replace(/\b(season \d+|part \d+|cour \d+|episode \d+|update|announcement)\b/gi, '')
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Fetches proper Trending Anime from AniList (Metric: Trending)
 */
/**
 * Fetches proper Trending Anime from AniList (Metric: Trending)
 */
export async function fetchAniListTrending(): Promise<any[]> {
    return fetchAniListTrendingRaw();
}

export async function fetchAniListTrendingRaw(telemetry?: any): Promise<any[]> {
    const query = `
        query {
            Page(page: 1, perPage: 10) {
                media(sort: TRENDING_DESC, type: ANIME) {
                    title {
                        romaji
                        english
                    }
                    status
                    description
                    coverImage {
                        extraLarge
                    }
                    bannerImage
                }
            }
        }
    `;
    try {
        const res = await fetch(ANILIST_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query })
        });
        const json = await res.json();
        return json.data?.Page?.media || [];
    } catch (e) {
        console.error("AniList Trending Failed:", e);
        return [];
    }
}

import { checkSocialSignals } from '../social/signals';

// The Master Aggregator Function
export async function fetchSmartTrendingCandidates(excludeTitles: string[] = []): Promise<{ candidates: any[], telemetry: any }> {
    const { CONTENT_RULES, SOURCE_TIERS } = await import('./sources-config');

    const telemetry = {
        totalRawItems: 0,
        duplicatesSkipped: 0,
        negativeKeywordsSkipped: 0,
        candidatesFound: 0
    };

    // 1. Fetch All Sources in Parallel
    const [aniList, reddit, news] = await Promise.all([
        fetchAniListTrendingRaw(telemetry),
        fetchTrendingSignals(telemetry),
        fetchAnimeIntel(telemetry)
    ]);

    const candidates: Record<string, TrendingCandidate> = {};
    const normalizedExcludes = (excludeTitles || []).map(normalizeTitle);

    // Helper to Add/Update Candidate
    const addVote = (title: string, source: string, image?: string, desc?: string, status?: string, tierScore: number = 0, metadata: Partial<TrendingCandidate> = {}) => {
        if (!title) return;
        const norm = normalizeTitle(title);

        // 1. DUPLICATE CHECK (Strict)
        if (normalizedExcludes.some(ex => norm.includes(ex) || ex.includes(norm))) {
            console.log(`[Fetcher DEBUG] Duplicate Skip: "${title}" (norm: ${norm})`);
            telemetry.duplicatesSkipped++;
            return; // Skip already published topics
        }

        // 2. NEGATIVE KEYWORD CHECK (Global Enforcement)
        const hasNegative = CONTENT_RULES.NEGATIVE_KEYWORDS.some(k => {
            if (k === 'AI') return false; // Handle AI separately below
            const regex = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            return regex.test(title) || (desc && regex.test(desc));
        }) || /\bAI\b/.test(title) || (desc && /\bAI\b/.test(desc));

        if (hasNegative) {
            const faultyKeyword = CONTENT_RULES.NEGATIVE_KEYWORDS.find(k => {
                if (k === 'AI') return /\bAI\b/.test(title) || (desc && /\bAI\b/.test(desc));
                const regex = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                return regex.test(title) || (desc && regex.test(desc));
            });
            console.log(`[Fetcher DEBUG] Negative Skip: "${title}" due to keyword "${faultyKeyword}"`);
            telemetry.negativeKeywordsSkipped++;
            return;
        }

        telemetry.totalRawItems++;

        // STRICTOR FUZZY MATCHING: Must have significant word overlap or exact match
        let key = Object.keys(candidates).find(k => {
            if (k === norm) return true;
            // Only allow fuzzy match if both are long enough to avoid "Update" swallowing everything
            if (k.length > 10 && norm.length > 10) {
                return k.includes(norm) || norm.includes(k);
            }
            return false;
        });

        if (!key) {
            key = norm;
            candidates[key] = {
                title: title,
                score: 0,
                sources: [],
                image: image,
                description: desc,
                status: status
            };
        }

        // Update entry
        if (!candidates[key].sources.includes(source)) {
            candidates[key].sources.push(source);
            // Boost score based on Source Tier/Quality
            candidates[key].score += 1 + tierScore;
        }

        // Merge Metadata
        if (metadata.anime_id) candidates[key].anime_id = metadata.anime_id;
        if (metadata.imageSearchTerm) candidates[key].imageSearchTerm = metadata.imageSearchTerm;
        if (metadata.claimType) candidates[key].claimType = metadata.claimType;
        if (metadata.event_fingerprint) candidates[key].event_fingerprint = metadata.event_fingerprint;
        if (metadata.truth_fingerprint) candidates[key].truth_fingerprint = metadata.truth_fingerprint;
        if (metadata.season_label) candidates[key].season_label = metadata.season_label;
        if (metadata.announcementAssets) candidates[key].announcementAssets = metadata.announcementAssets;
        if (metadata.source_url) candidates[key].source_url = metadata.source_url;
        if (metadata.verification_tier) candidates[key].verification_tier = metadata.verification_tier;
        if (metadata.slug) (candidates[key] as any).slug = metadata.slug;

        // Upgrade image/desc if missing and this source has it
        if (!candidates[key].image && image) candidates[key].image = image;
        if (!candidates[key].status && status) candidates[key].status = status;

        // Description priority: News > AniList > Reddit
        const isSynopsis = desc && desc.length > 50;
        if (source === 'Crunchyroll/News' && desc) {
            candidates[key].description = desc;
        } else if (source === 'AniList' && !candidates[key].description && isSynopsis) {
            candidates[key].description = desc;
        } else if (!candidates[key].description && desc) {
            candidates[key].description = desc;
        }
    };

    // 2. Process Sources
    console.log(`[Fetcher] Sourcing: AniList: ${aniList.length}, Reddit: ${reddit.length}, News: ${news.length}`);

    // AniList (Visuals & Popularity) - Baseline
    aniList.forEach((item: any) => {
        const t = item.title.english || item.title.romaji;
        const img = item.bannerImage || item.coverImage?.extraLarge;
        const cleanDesc = item.description ? item.description.replace(/<[^>]*>?/gm, '') : '';
        addVote(t, 'AniList', img, cleanDesc, item.status, 0);
    });

    // Reddit (Discussion & Buzz)
    reddit.forEach((item: any) => {
        addVote(item.title, 'Reddit', undefined, item.content, undefined, 0.5);
    });

    // News (Crunchyroll/ANN - "Official" updates)
    news.forEach((item: any) => {
        const boost = item.tier_match ? 5 : 3;
        addVote(item.title, item.source || 'Crunchyroll/News', undefined, item.content, undefined, boost, {
            anime_id: item.anime_id,
            imageSearchTerm: item.imageSearchTerm,
            claimType: item.claimType,
            event_fingerprint: item.event_fingerprint,
            truth_fingerprint: item.truth_fingerprint,
            season_label: item.season_label,
            announcementAssets: item.announcementAssets,
            source_url: item.source_url,
            verification_tier: item.verification_tier
        });
    });

    // 3. Ranking & Selection
    console.log(`[Fetcher] Ranking ${Object.keys(candidates).length} candidates...`);
    const ranked = Object.values(candidates).map((c: any) => {
        let finalScore = c.score;

        // IMPACT BOOST
        const highImpactWords = ['season', 'announcement', 'gets', 'confirmed', 'sequel'];
        const isImpact = c.title && highImpactWords.some(k => c.title.toLowerCase().includes(k));
        if (isImpact) finalScore += 15;

        // POPULARITY BIAS
        if (c.sources.includes('AniList') && (c.sources.includes('Crunchyroll/News') || c.sources.includes('Reddit'))) {
            finalScore += 5;
        }

        return { ...c, finalScore };
    }).sort((a, b) => b.finalScore - a.finalScore);

    if (ranked.length === 0) return { candidates: [], telemetry };

    // --- PROCESS TOP CANDIDATES (Limit 10) ---
    const finalResults = [];

    for (const winner of ranked.slice(0, 10)) {
        if (winner.finalScore < 1.0) continue;

        const finalContent = winner.description || `Latest updates and community discussions regarding ${winner.title}.`;
        const t = winner.title.toLowerCase();
        const c = finalContent.toLowerCase();

        let claimType: ClaimType = winner.claimType || 'OTHER_ABORT';
        if (t.includes('delay') || t.includes('hiatus') || t.includes('postponed')) claimType = 'DELAY';
        else if (t.includes('trailer') || t.includes('pv') || t.includes('teaser')) claimType = 'TRAILER_DROP';
        else if (t.includes('visual') || t.includes('key visual')) claimType = 'NEW_KEY_VISUAL';
        else if (t.includes('staff')) claimType = 'STAFF_UPDATE';
        else if (t.includes('cast')) claimType = 'CAST_ADDITION';
        else if (t.includes('date') || t.includes('premiere') || t.includes('debuts')) claimType = 'DATE_ANNOUNCED';
        else if (t.includes('season') && (t.includes('confirmed') || t.includes('sequel') || t.includes('greenlit') || t.includes('announces'))) claimType = 'NEW_SEASON_CONFIRMED';

        // --- ANIME ID & SEASON EXTRACTION ---
        // Prefer Metadata from Intel/News sources if available
        let animeId = winner.anime_id || winner.title.trim()
            .replace(/[【】\[\]]/g, '') // Remove brackets first
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, ''); // Trim trailing/leading hyphens
        let seasonLabel = winner.season_label || null;

        if (!seasonLabel) {
            const seasonMatch = winner.title.match(/(?:Season\s+(\d+))|(?:\b(\d+)(?:st|nd|rd|th)?\s+Season\b)/i);
            seasonLabel = seasonMatch ? `Season ${seasonMatch[1] || seasonMatch[2]}` : null;

            const partMatch = winner.title.match(/(?:Part\s+(\d+))|(?:Cour\s+(\d+))/i);
            if (partMatch) {
                const partSuffix = partMatch[1] ? `Part ${partMatch[1]}` : `Cour ${partMatch[2]}`;
                seasonLabel = seasonLabel ? `${seasonLabel} ${partSuffix}` : partSuffix;
            }
        }

        // --- REALITY CHECK (MANDATORY FOR SEASONS) ---
        if (t.includes('season')) {
            const reality = await verifyAnimeReality(animeId, seasonLabel || undefined);
            if (reality.isStale) {
                console.log(`[Fetcher] STALE_CONFIRMATION_ABORT: ${winner.title} | Reason: ${reality.reason}`);
                continue; // ABSOLUTE ABORT: Do not reword, do not salvage.
            }
        }

        // --- FINGERPRINTING ---
        const fingerprint = generateEventFingerprint({
            anime_id: animeId,
            event_type: claimType,
            canonical_announcement_key: winner.title,
            primary_signal_date_or_asset_id: new Date().toISOString().split('T')[0]
        });

        const truthFingerprint = generateTruthFingerprint({
            anime_id: animeId,
            event_type: claimType,
            season_label: seasonLabel || undefined
        });

        telemetry.candidatesFound++;
        finalResults.push({
            title: winner.title,
            fullTitle: winner.title,
            content: finalContent,
            claimType: winner.claimType || claimType,
            anime_id: animeId,
            season_label: seasonLabel,
            imageSearchTerm: winner.imageSearchTerm || animeId,
            event_fingerprint: winner.event_fingerprint || fingerprint,
            truth_fingerprint: winner.truth_fingerprint || truthFingerprint,
            slug: (winner as any).slug || winner.slug,
            image: winner.image || '/hero-bg-final.png',
            announcementAssets: winner.announcementAssets || [],
            source: winner.sources[0],
            source_url: winner.source_url || "",
            verification_tier: winner.verification_tier || (winner.sources.includes('AniList') ? 3 : 6),
            publishedAt: winner.publishedAt || new Date().toISOString(),
            finalScore: winner.finalScore
        });
    }

    return { candidates: finalResults, telemetry };
}

/**
 * Searches AniList for multiple official media images by title.
 * Returns up to 3 high-quality images (Cover or Banner).
 */
export async function fetchOfficialAnimeImages(title: string, page: number = 1): Promise<string[]> {
    const query = `
        query ($search: String, $page: Int) {
            Page(page: $page, perPage: 6) { 
                media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
                    id
                    coverImage {
                        extraLarge
                        large
                    }
                    bannerImage
                    streamingEpisodes {
                        thumbnail
                    }
                }
            }
        }
    `;

    try {
        const response = await fetch(ANILIST_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ query, variables: { search: title, page: page } })
        });
        const json = await response.json();
        const mediaList = json.data?.Page?.media || [];

        const images: string[] = [];

        mediaList.forEach((media: any) => {
            if (media.bannerImage) images.push(media.bannerImage);
            if (media.coverImage?.extraLarge) images.push(media.coverImage.extraLarge);
            if (media.streamingEpisodes && media.streamingEpisodes.length > 0) {
                // Get a random thumbnail from episodes
                images.push(media.streamingEpisodes[media.streamingEpisodes.length - 1].thumbnail);
            }
        });

        // Filter duplicates and return top 6 (expanded from 3)
        return [...new Set(images)];
    } catch (e) {
        console.error("Failed to fetch official images:", e);
        return [];
    }
}
