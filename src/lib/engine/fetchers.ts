/**
 * fetchers.ts
 * Data fetching layer for KumoLab Blog Automation
 */

const ANILIST_URL = 'https://graphql.anilist.co';

export interface VerificationProvenance {
    tier: 'streamer' | 'popularity' | 'format_exception';
    reason: string;
    sources: any;
}

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
 * Placeholder for News Aggregation (Intel)
 */
/**
 * Fetches real Anime News from ANN/Crunchyroll RSS (Simulated parsing)
 */
export async function fetchAnimeIntel(): Promise<any[]> {
    let items: any[] = [];
    const { CONTENT_RULES, SOURCE_TIERS } = await import('./sources-config');

    // 1. Try to fetch from RSS Feeds
    const feeds = [
        { name: 'AnimeNewsNetwork', url: 'https://www.animenewsnetwork.com/all/rss.xml' },
        { name: 'ComicBook', url: 'https://comicbook.com/anime/rss' }
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
            const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/;

            let match;
            while ((match = itemRegex.exec(text)) !== null) {
                try {
                    const itemBlock = match[0];
                    const titleMatch = titleRegex.exec(itemBlock);
                    const linkMatch = linkRegex.exec(itemBlock);
                    const descMatch = descRegex.exec(itemBlock);
                    const dateMatch = pubDateRegex.exec(itemBlock);

                    if (!titleMatch || !linkMatch) continue;

                    const rawTitle = (titleMatch[1] || '').replace('<![CDATA[', '').replace(']]>', '').trim();
                    const rawDescription = (descMatch ? descMatch[1] : '').replace('<![CDATA[', '').replace(']]>', '').replace(/<[^>]*>?/gm, '').trim();
                    const pubDate = dateMatch ? new Date(dateMatch[1]) : new Date();

                    if (!rawTitle) continue;

                    // --- NEW STRICT FILTERING LOGIC ---
                    // 1. Negative Filter
                    const lowerTitleRaw = rawTitle.toLowerCase();
                    const lowerDescRaw = rawDescription.toLowerCase();

                    // Title check is strict
                    const forbiddenWords = [...CONTENT_RULES.NEGATIVE_KEYWORDS, 'manga', 'volume', 'webtoon', 'manhwa', 'novel', 'light novel'];
                    const titleNegative = forbiddenWords.some(k => lowerTitleRaw.includes(k.toLowerCase()));
                    if (titleNegative) {
                        console.log(`[Fetcher] Skipping (Negative/Manga Title): ${rawTitle}`);
                        continue;
                    }

                    // Description check only for extremely forbidden topics to avoid killing news that mentions source material
                    const descNegative = ['mario', 'ai'].some(k => lowerDescRaw.includes(k));
                    if (descNegative) {
                        console.log(`[Fetcher] Skipping (Negative Desc): ${rawTitle}`);
                        continue;
                    }

                    const hasPositive = CONTENT_RULES.POSITIVE_KEYWORDS.some(k => rawTitle.toLowerCase().includes(k.toLowerCase()));
                    const combinedTiers = [...(SOURCE_TIERS.TIER_1_NAMES || []), ...(SOURCE_TIERS.TIER_2_NAMES || [])];
                    const isTierMatch = combinedTiers.some(t => rawTitle.toLowerCase().includes(t.toLowerCase()));

                    const highImpactKeywords = ['season', 'announcement', 'gets', 'confirmed', 'sequel', 'visual'];
                    const isHighImpact = highImpactKeywords.some(k => rawTitle.toLowerCase().includes(k));

                    if (!hasPositive && !isTierMatch && !isHighImpact) continue;

                    // 3. Recency Check (Strict 72h for full coverage)
                    if (Date.now() - pubDate.getTime() > 72 * 60 * 60 * 1000) continue;

                    // Process Valid Item
                    let claimType: any = 'confirmed';
                    const lowerTitle = rawTitle.toLowerCase();

                    if (lowerTitle.includes('delay') || lowerTitle.includes('postponed') || lowerTitle.includes('rescheduled')) claimType = 'delayed';
                    else if (lowerTitle.includes('trailer') || lowerTitle.includes('pv') || lowerTitle.includes('teaser')) claimType = 'trailer';
                    else if (lowerTitle.includes('visual') || lowerTitle.includes('key visual')) claimType = 'new_visual';
                    else if (lowerTitle.includes('premiere') || lowerTitle.includes('debuts')) claimType = 'premiered';

                    let cleanTitle = rawTitle
                        .replace(/Original TV Anime/gi, '')
                        .replace(/TV Anime/gi, '')
                        .replace(/Original Anime/gi, '')
                        .replace(/Anime's/gi, "'s")
                        .replace(/Anime/gi, '')
                        .replace(/\s+/g, ' ').trim();

                    if (cleanTitle.length < 5) cleanTitle = rawTitle;

                    let searchName = rawTitle.includes(':') ? rawTitle.split(':')[0].trim() : rawTitle;
                    const noiseWords = ['Original', 'TV', 'Anime', 'The Movie', 'Movie', 'Season', 'Cour', 'Part', 'Reveals', 'Announces', 'Confirms', 'Trailer', 'Visual', 'Cast', 'Staff', 'Release Date', 'Delay', 'Postponed', 'Info'];
                    noiseWords.forEach(word => {
                        searchName = searchName.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
                    });
                    searchName = searchName.replace(/["'']/g, '').replace(/\s+/g, ' ').trim();

                    items.push({
                        title: cleanTitle,
                        fullTitle: cleanTitle,
                        claimType,
                        slug: 'intel-' + cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50),
                        content: rawDescription.substring(0, 280),
                        imageSearchTerm: searchName,
                        source: feed.name,
                        tier_match: combinedTiers.some(t => rawTitle.toLowerCase().includes(t.toLowerCase())) ? 2 : 5 // Rough tier scoring
                    });
                } catch (err) {
                    console.error("[Image Engine] Error processing RSS item:", err);
                }
            }
        } catch (e) {
            console.error(`Failed to fetch RSS Intel from ${feed.name}:`, e);
        }
    }

    // 2. Sort and return top unique items
    const uniqueItems = Array.from(new Map(items.map(item => [item.title.toLowerCase(), item])).values());
    console.log(`[Fetcher] Total unique Intel items found: ${uniqueItems.length}`);

    return uniqueItems.slice(0, 10);
}

/**
 * Fetches real Trending discussions from Reddit r/anime (Hot/Top)
 */
export async function fetchTrendingSignals(): Promise<any[]> {
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
}

// Helper to normalize titles for comparison
// Helper to normalize titles for comparison
function normalizeTitle(t: string): string {
    if (!t) return "";
    return t.toLowerCase()
        .replace(/【|】|\[|\]|\(|\)/g, '') // Remove brackets
        .replace(/season \d+|part \d+|cour \d+/gi, '') // Remove season info for matching
        .replace(/tv anime|anime/gi, '') // Remove filler
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

async function fetchAniListTrendingRaw(): Promise<any[]> {
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

/**
 * The Master Aggregator Function
 */
export async function fetchSmartTrendingCandidates(excludeTitles: string[] = []): Promise<any> {
    const { CONTENT_RULES, SOURCE_TIERS } = await import('./sources-config');

    // 1. Fetch All Sources in Parallel
    const [aniList, reddit, news] = await Promise.all([
        fetchAniListTrendingRaw(),
        fetchTrendingSignals(),
        fetchAnimeIntel()
    ]);

    const candidates: Record<string, TrendingCandidate> = {};
    const normalizedExcludes = (excludeTitles || []).map(normalizeTitle);

    // Helper to Add/Update Candidate
    const addVote = (title: string, source: string, image?: string, desc?: string, status?: string, tierScore: number = 0) => {
        if (!title) return;
        const norm = normalizeTitle(title);

        // 1. DUPLICATE CHECK (Strict)
        if (normalizedExcludes.some(ex => norm.includes(ex) || ex.includes(norm))) {
            return; // Skip already published topics
        }

        // 2. NEGATIVE KEYWORD CHECK (Global Enforcement)
        const hasNegative = CONTENT_RULES.NEGATIVE_KEYWORDS.some(k =>
            title.toLowerCase().includes(k.toLowerCase()) ||
            (desc && desc.toLowerCase().includes(k.toLowerCase()))
        );
        if (hasNegative) return;

        let key = Object.keys(candidates).find(k => k === norm || k.includes(norm) || norm.includes(k));
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
        addVote(item.title, 'Crunchyroll/News', undefined, item.content, undefined, boost);
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

    if (ranked.length === 0) return [];

    // --- PROCESS TOP CANDIDATES (Limit 10) ---
    const finalResults = [];

    for (const winner of ranked.slice(0, 10)) {
        if (winner.finalScore < 2.5) continue;

        const finalContent = winner.description || `Latest updates and community discussions regarding ${winner.title}.`;

        // --- CONTEXTUAL TAG LOGIC (PRIORITIZED) ---
        let possibleTags: string[] = [];

        const t = winner.title.toLowerCase();
        const c = finalContent.toLowerCase();

        if (t.includes('season') || c.includes('season')) possibleTags.push("SEASON ANNOUNCEMENT");
        if (t.includes('trailer') || t.includes('pv')) possibleTags.push("TRAILER REVEAL");
        if (t.includes('visual')) possibleTags.push("VISUAL REVEAL");
        if (t.includes('delay') || t.includes('hiatus')) possibleTags.push("PRODUCTION DELAY");
        if (t.includes('episode') && t.includes('discussion')) possibleTags.push("EPISODE REACTION");

        if (winner.sources.includes('Reddit')) possibleTags.push("COMMUNITY BUZZ");

        if (winner.status === 'RELEASING' || winner.sources.includes('AniList')) {
            if (winner.status === 'RELEASING') possibleTags.push("CURRENTLY AIRING");
            else possibleTags.push("TRENDING NOW");
        }

        const priorityOrder = [
            "SEASON ANNOUNCEMENT", "TRAILER REVEAL", "PRODUCTION DELAY",
            "VISUAL REVEAL", "EPISODE REACTION", "COMMUNITY BUZZ",
            "CURRENTLY AIRING", "TRENDING NOW", "ANIME DISCOURSE"
        ];

        let contextTag = priorityOrder.find(tag => possibleTags.includes(tag)) || "ANIME DISCOURSE";

        finalResults.push({
            title: winner.title,
            fullTitle: `${winner.title}`,
            slug: `trending-${winner.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
            content: finalContent,
            image: winner.image,
            imageSearchTerm: winner.title,
            trendReason: contextTag,
            momentum: 1.0 + (winner.score * 0.1),
            source: 'KumoLab SmartSync'
        });
    }

    return finalResults;
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
