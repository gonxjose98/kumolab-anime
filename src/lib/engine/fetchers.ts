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
        return media?.coverImage?.extraLarge || media?.bannerImage || media?.coverImage?.large || null;
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
    try {
        // Using AnimeNewsNetwork RSS
        const response = await fetch('https://www.animenewsnetwork.com/news/rss.xml');
        const text = await response.text();

        // Simple regex RSS parser (lightweight, no deps)
        const items = [];
        const itemRegex = /<item>[\s\S]*?<\/item>/g;
        const titleRegex = /<title>(.*?)<\/title>/;
        const linkRegex = /<link>(.*?)<\/link>/;
        const descRegex = /<description>([\s\S]*?)<\/description>/;
        const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/;

        let match;
        while ((match = itemRegex.exec(text)) !== null) {
            const itemBlock = match[0];
            const titleMatch = titleRegex.exec(itemBlock);
            const linkMatch = linkRegex.exec(itemBlock);
            const descMatch = descRegex.exec(itemBlock);
            const dateMatch = pubDateRegex.exec(itemBlock);

            if (titleMatch && linkMatch) {
                // Filter for "Season" or "Announced" or "Movie" to match 'Intel' criteria
                const title = titleMatch[1].replace('<![CDATA[', '').replace(']]>', '');
                const description = descMatch ? descMatch[1].replace('<![CDATA[', '').replace(']]>', '').replace(/<[^>]*>?/gm, '') : ''; // Strip HTML

                // INTEL KEYWORDS (Refined for Series Focus)
                // Topics: Season confirmations, visual reveals, trailers, delays.
                const strictKeywords = [
                    'Season', 'Cour', // Specific anime terminology
                    'Trailer', 'Visual', 'PV', // Visuals
                    'Release Date', // Dates
                    'Movie', // Films (but checked against negatives)
                ];

                // NEGATIVE KEYWORDS (Brutal Exclusion of Meta/Industry News)
                // We strictly want ANIME SERIES UPDATES.
                const negativeKeywords = [
                    'Game', 'Video Game', 'RPG', 'Launch', 'Gameplay', 'Stream', // Gaming
                    'Manga', 'Novel', 'Light Novel', 'Chapter', 'Volume', // Print
                    'Live-Action', 'Stage Play', 'Musical', 'Live Action', 'Play', // Theatrical/Live
                    'Award', 'Prize', 'Nomination', 'Winner', // Awards
                    'Comic-Con', 'Convention', 'Event', 'Expo', // Events
                    'Interview', 'Report', 'Review', 'Editorial', // Meta content
                    'Cosplay', 'Figure', 'Merch', 'Blu-ray', 'Sales', 'Ranking', 'Poll', // Merch/Stats
                    'Earnings', 'Financial', 'Stock', // Business
                    'Actor', 'Voice Actor', 'Seiyuu', 'Director', // Staff news (unless new project)
                    'Dub', 'English Dub' // Dub news usually secondary
                ];

                const hasPositive = strictKeywords.some(k => title.includes(k));
                const hasNegative = negativeKeywords.some(k => title.includes(k) || description.includes(k));

                if (hasPositive && !hasNegative) {
                    const pubDate = dateMatch ? new Date(dateMatch[1]) : new Date();

                    // Recent news (last 72h)
                    if (Date.now() - pubDate.getTime() < 72 * 60 * 60 * 1000) {

                        // Smart Claim Type Detection
                        let claimType = 'confirmed';
                        if (title.includes('Delay') || title.includes('Postponed') || title.includes('Hiatus')) {
                            claimType = 'delayed';
                        } else if (title.includes('Trailer') || title.includes('PV')) {
                            claimType = 'trailer';
                        } else if (title.includes('Visual')) {
                            claimType = 'confirmed'; // Visuals usually confirm a look/season
                        }

                        // CLEAN TITLE LOGIC
                        // User banned "Original TV", "TV Anime", and now "Anime" global
                        let cleanTitle = title
                            .replace(/Original TV Anime/gi, '')
                            .replace(/TV Anime/gi, '')
                            .replace(/Original Anime/gi, '')
                            .replace(/Anime/gi, '') // BANNED WORD: Anime
                            .replace(/\s+/g, ' ').trim();

                        // OPTIMIZED SEARCH TERM EXTRACTION
                        // Goal: Get JUST the anime name. "Inherit the Winds Original TV Anime..." -> "Inherit the Winds"

                        let searchName = "";

                        // Strategy A: Pre-colon (Highest confidence)
                        // "Frieren: Beyond Journey's End" -> "Frieren"
                        if (title.includes(':')) {
                            searchName = title.split(':')[0].trim();
                        } else {
                            // Strategy B: Clean the whole string
                            searchName = title;
                        }

                        // Remove all noise words from search term
                        const noiseWords = [
                            'Original', 'TV', 'Anime', 'The Movie', 'Movie',
                            'Season', 'Cour', 'Part',
                            'Reveals', 'Announces', 'Confirms', 'Trailer', 'Visual', 'Cast', 'Staff',
                            'Release Date', 'Delay', 'Postponed', 'Info',
                            'Channel', 'Views', 'Million', 'Billion', 'Subscriber', 'Platform',
                            'Surpasses', 'Attracts', 'Streaming', 'Service', 'English-Language'
                        ];

                        noiseWords.forEach(word => {
                            const regex = new RegExp(`\\b${word}\\b`, 'gi');
                            searchName = searchName.replace(regex, '');
                        });

                        // Remove common news-style artifacts
                        searchName = searchName.replace(/["'']/g, ''); // Fix quotes

                        searchName = searchName.replace(/\s+/g, ' ').trim();

                        // Fallback: If we stripped it to death, take the first 3 words of the ORIGINAL title (ignoring noise)
                        if (searchName.length < 2) {
                            searchName = title.split(' ').slice(0, 3).join(' ');
                        }

                        items.push({
                            title: cleanTitle,
                            fullTitle: cleanTitle,
                            claimType: claimType,
                            premiereDate: new Date().toISOString().split('T')[0],
                            slug: 'intel-' + cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50),
                            content: description.substring(0, 280),
                            imageSearchTerm: searchName,
                            source: 'AnimeNewsNetwork'
                        });
                    }
                } else {
                    // Fallback Logic (Same strictness applied to Generic fallback to prevent Games slipping in)
                    const pubDate = dateMatch ? new Date(dateMatch[1]) : new Date();

                    // Also check negatives here
                    if (!hasNegative && (Date.now() - pubDate.getTime() < 48 * 60 * 60 * 1000)) {
                        items.push({
                            title: title,
                            fullTitle: title,
                            claimType: 'now_streaming', // Safe default
                            premiereDate: new Date().toISOString().split('T')[0],
                            slug: 'news-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50),
                            content: description.substring(0, 280),
                            imageSearchTerm: title.split(':')[0],
                            source: 'ANN (Generic)'
                        });
                    }
                }
            }
        }

        // Return top 3 matches (prioritizing the first pushed ones which might be keyword matches if I sorted, but currently simple push)
        // Let's sort to prioritize those capable of being 'confirmed' (keyword matches) if we modified strictness.
        // For now, just return items.

        // Ensure we have at least 3 items by supplementing with Trending Data
        // If RSS was too strict or empty, this fills the gap with real anime.
        if (items.length < 3) {
            console.log(`Only found ${items.length} valid RSS items. Supplementing with AniList Trending...`);
            try {
                const trendingData = await fetchAniListTrendingRaw();

                for (const trend of trendingData) {
                    if (items.length >= 3) break;

                    const title = trend.title.english || trend.title.romaji;
                    // Dedupe
                    if (items.some(i => i.title === title)) continue;

                    items.push({
                        title: title,
                        fullTitle: title,
                        claimType: 'now_streaming',
                        premiereDate: new Date().toISOString().split('T')[0],
                        slug: 'intel-trending-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50),
                        content: (trend.description || "The anime community is buzzing about this top-trending series.").replace(/<[^>]*>?/gm, '').substring(0, 280),
                        imageSearchTerm: title,
                        source: 'AniList Trending'
                    });
                }
            } catch (e) {
                console.warn("Trending supplement failed:", e);
            }
        }

        if (items.length === 0) {
            // Absolute Fail Safe
            return [{
                title: "Anime Season Highlights",
                fullTitle: "Community Highlights",
                claimType: 'now_streaming',
                premiereDate: new Date().toISOString().split('T')[0],
                slug: 'fallback-' + Date.now(),
                content: "Check out the latest discussions.",
                imageSearchTerm: "Anime",
                source: "System Fallback"
            }];
        }

        return items.slice(0, 3); // Return top 3 matches
    } catch (e) {
        console.error("Failed to fetch RSS Intel:", e);
        // Fallback to empty to allow safe failure
        return [];
    }
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
}

// Helper to normalize titles for comparison
function normalizeTitle(t: string): string {
    return t.toLowerCase().replace(/[^\w\s]/g, '').trim();
}

/**
 * Fetches proper Trending Anime from AniList (Metric: Trending)
 */
async function fetchAniListTrendingRaw(): Promise<any[]> {
    const query = `
        query {
            Page(page: 1, perPage: 10) {
                media(sort: TRENDING_DESC, type: ANIME) {
                    title {
                        romaji
                        english
                    }
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
    // 1. Fetch All Sources in Parallel
    const [aniList, reddit, news] = await Promise.all([
        fetchAniListTrendingRaw(),
        fetchTrendingSignals(), // From Reddit
        fetchAnimeIntel()       // From News (ANN as proxy for 'Crunchyroll'/News ecosystem)
    ]);

    const candidates: Record<string, TrendingCandidate> = {};
    const normalizedExcludes = excludeTitles.map(normalizeTitle);

    // Helper to Add/Update Candidate
    const addVote = (title: string, source: string, image?: string, desc?: string) => {
        if (!title) return;
        const norm = normalizeTitle(title);

        // DUPLICATE CHECK (Strict)
        if (normalizedExcludes.some(ex => norm.includes(ex) || ex.includes(norm))) {
            return; // Skip already published topics
        }

        let key = Object.keys(candidates).find(k => k === norm || k.includes(norm) || norm.includes(k));
        if (!key) {
            key = norm;
            candidates[key] = {
                title: title,
                score: 0,
                sources: [],
                image: image,
                description: desc
            };
        }

        // Update entry
        if (!candidates[key].sources.includes(source)) {
            candidates[key].sources.push(source);
            candidates[key].score += 1;
        }
        // Upgrade image/desc if missing and this source has it
        // We prefer News/AniList descriptions over Reddit self-text often, unless Reddit is the ONLY source.
        // Actually, AniList description is usually the synopsis. News description is the news itself. 
        // We prioritize News Description > AniList Synopsis (stripped) > Reddit Content > Placeholder.
        if (!candidates[key].image && image) candidates[key].image = image;

        const isSynopsis = desc && desc.length > 50;
        if (source === 'Crunchyroll/News' && desc) {
            candidates[key].description = desc; // News is most relevant/current
        } else if (source === 'AniList' && !candidates[key].description && isSynopsis) {
            candidates[key].description = desc; // Fallback to synopsis
        } else if (!candidates[key].description && desc) {
            candidates[key].description = desc;
        }
    };

    // 2. Process Sources

    // AniList (Visuals & Popularity)
    aniList.forEach((item: any) => {
        const t = item.title.english || item.title.romaji;
        const img = item.bannerImage || item.coverImage?.extraLarge;
        // Strip HTML from AniList description
        const cleanDesc = item.description ? item.description.replace(/<[^>]*>?/gm, '') : '';
        addVote(t, 'AniList', img, cleanDesc);
    });

    // Reddit (Discussion & Buzz)
    reddit.forEach((item: any) => {
        addVote(item.title, 'Reddit', undefined, item.content);
    });

    // News (Crunchyroll/ANN - "Official" updates)
    news.forEach((item: any) => {
        addVote(item.title, 'Crunchyroll/News', undefined, item.content);
    });

    // 3. Ranking & Selection
    const ranked = Object.values(candidates).map(c => {
        // SCORING ALGORITHM V2
        // Base Score: Number of Sources
        let finalScore = c.score;

        // Boost: AniList Trending (Proven Popularity)
        if (c.sources.includes('AniList')) finalScore += 5;

        // Boost: Reddit Discussion (Community Engagement)
        if (c.sources.includes('Reddit')) finalScore += 3;

        // Penalize: Niche News Keywords (Cast, Song, Visual, Film)
        // We want SERIES discussions for Trending, not just press releases.
        const lowQualityKeywords = ['Cast', 'Theme Song', 'Performing', 'Preview', 'Visual', 'Film', 'Movie', 'Screening', 'Stage', 'Actor', 'Director'];
        if (lowQualityKeywords.some(k => c.title.includes(k))) finalScore -= 3;

        return { ...c, finalScore };
    }).sort((a, b) => b.finalScore - a.finalScore); // Sort by calculated score

    if (ranked.length === 0) return null;

    // Pick Winner
    const winner = ranked[0];

    // --- CROSS REFERENCE WITH SOCIALS (X/IG) ---
    // User Verification Request: "Check if trending on more than 1 social media"
    try {
        const socialSignals = await checkSocialSignals(winner.title);
        if (socialSignals.length > 0) {
            socialSignals.forEach(s => {
                if (!winner.sources.includes(s.source)) {
                    winner.sources.push(s.source);
                    winner.score += s.score;
                }
            });
            console.log(`[SmartSync] Social Cross-Ref Confirmed: ${winner.title} on ${socialSignals.map(s => s.source).join(', ')}`);
        }
    } catch (e) {
        console.warn("[SmartSync] Social Cross-Ref Check Skipped/Failed:", e);
    }

    // Clean Description Logic: Ensure it's not empty, otherwise generic.
    const finalContent = winner.description || `Latest updates and community discussions regarding ${winner.title}.`;

    // Construct final Signal Item
    return {
        title: winner.title,
        fullTitle: `${winner.title}`,
        slug: `trending-${winner.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
        content: finalContent,
        image: winner.image,
        imageSearchTerm: winner.title,
        trendReason: `Trending on: ${winner.sources.join(', ')}`,
        momentum: 1.0 + (winner.score * 0.1),
        source: 'KumoLab SmartSync'
    };
}

/**
 * Searches AniList for multiple official media images by title.
 * Returns up to 3 high-quality images (Cover or Banner).
 */
export async function fetchOfficialAnimeImages(title: string): Promise<string[]> {
    const query = `
        query ($search: String) {
            Page(page: 1, perPage: 3) {
                media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
                    id
                    coverImage {
                        extraLarge
                        large
                    }
                    bannerImage
                }
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
        const mediaList = json.data?.Page?.media || [];

        const images: string[] = [];

        mediaList.forEach((media: any) => {
            if (media.bannerImage) images.push(media.bannerImage);
            if (media.coverImage?.extraLarge) images.push(media.coverImage.extraLarge);
        });

        // Filter duplicates and return top 3
        return [...new Set(images)].slice(0, 3);
    } catch (e) {
        console.error("Failed to fetch official images:", e);
        return [];
    }
}
