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

        // STRICT VALIDATION & PROVENANCE ATTACHMENT
        const verifiedEpisodes: AiringEpisode[] = [];

        for (const ep of rawEpisodes) {
            const provenance = validateAiringDrop(ep);
            if (provenance) {
                // Attach provenance and add to list
                ep.provenance = provenance;
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
 * STRICT VERIFICATION SYSTEM
 * 
 * A post qualifies ONLY if it meets one of these Trusted Tiers:
 * 
 * TIER 1: VERIFIED STREAMER
 * - Has a direct link to Crunchyroll, Netflix, Hulu, Disney+, HiDive, or Amazon.
 * - This confirms distribution rights and air date.
 * 
 * TIER 2: CROWD WISDOM (POPULARITY SAFEGUARD)
 * - If streamer link is missing/delayed, the show must have > 20,000 members.
 * - Filters out obscure shovelware, unverified shorts, and database noise.
 * 
 * TIER 3: FORMAT LOCK
 * - Must be TV, MOVIE, or OVA.
 * - REJECTS 'TV_SHORT' and 'SPECIAL' unless they pass Tier 2 with flying colors (>50k).
 */
const TRUSTED_STREAMERS = [
    'Crunchyroll', 'Netflix', 'Hulu', 'Disney Plus', 'Hidive', 'Amazon Prime Video', 'Bilibili Global', 'Muse Asia', 'Ani-One'
];

export function validateAiringDrop(episode: any): VerificationProvenance | null {
    const media = episode.media;

    // 0. EXCLUDE ADULT CONTENT
    if (media.isAdult) return null;

    // 1. FORMAT LOCK
    const isMainFormat = ['TV', 'MOVIE', 'OVA', 'ONA'].includes(media.format);
    const isNicheFormat = ['TV_SHORT', 'SPECIAL', 'MUSIC'].includes(media.format);

    if (!isMainFormat && !isNicheFormat) return null; // Reject unknown formats

    // 2. CHECK FOR TRUSTED STREAMERS
    const trustedLink = media.externalLinks.find((link: any) =>
        TRUSTED_STREAMERS.some(trusted => link.site.toLowerCase().includes(trusted.toLowerCase()))
    );

    // 3. APPLY TIERS

    // TIER 1: Streamer Verified (Accept immediately if format is standard)
    if (trustedLink && isMainFormat) {
        return {
            tier: 'streamer',
            reason: `Verified on ${trustedLink.site}`,
            sources: { externalLinks: [trustedLink.site] }
        };
    }

    // TIER 2: Crowd Wisdom (Popularity Safeguard) + STATE CHECK
    // Requirements: > 20k Pop AND (Releasing OR Recent Season)
    const HIGH_POPULARITY_THRESHOLD = 20000;
    const MEGA_POPULARITY_THRESHOLD = 50000; // For shorts/specials

    // State Check (Anti-Ghosting)
    const currentYear = new Date().getFullYear();
    const isRecent = media.seasonYear ? Math.abs(media.seasonYear - currentYear) <= 1 : false;
    const isActive = media.status === 'RELEASING' || (media.status === 'FINISHED' && isRecent);

    if (isActive && media.popularity >= HIGH_POPULARITY_THRESHOLD && isMainFormat) {
        return {
            tier: 'popularity',
            reason: `High Popularity (${media.popularity}) + Active Status`,
            sources: { popularity: media.popularity, status: media.status }
        };
    }

    // TIER 3: Format Exception (Shorts/Specials)
    if (isActive && media.popularity >= MEGA_POPULARITY_THRESHOLD && isNicheFormat) {
        return {
            tier: 'format_exception',
            reason: `Special Format with Mega Popularity (${media.popularity})`,
            sources: { popularity: media.popularity, format: media.format }
        };
    }

    // If it fails all tiers -> REJECT
    console.log(`[Validation Reject] ${media.title.english || media.title.romaji} (Pop: ${media.popularity}, Format: ${media.format}, Status: ${media.status})`);
    return null;
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
export async function fetchAnimeIntel(): Promise<any[]> {
    return [
        {
            title: "Frieren: Beyond Journey's End",
            claimType: "confirmed",
            premiereDate: "2026-10-01",
            fullTitle: "Frieren Season 2 Officially Confirmed",
            slug: "frieren-s2-announced",
            content: "Studio Madhouse has officially confirmed Frieren Season 2 is in production. The sequel will follow the El Dorado arc.",
            imageSearchTerm: "Frieren: Beyond Journey's End",
            source: "Official Website"
        },
        {
            title: "Oshi no Ko",
            claimType: "confirmed",
            premiereDate: "2026-04-10",
            fullTitle: "Oshi no Ko Season 3 Set for Spring 2026",
            slug: "oshi-no-ko-s3-confirmed",
            content: "Oshi no Ko Season 3 has been officially greenlit for a Spring 2026 premiere. Production details remain with Doga Kobo.",
            imageSearchTerm: "Oshi no Ko",
            source: "Official Website"
        }
    ];
}

/**
 * Placeholder for Trend Analysis
 */
export async function fetchTrendingSignals(): Promise<any[]> {
    return [
        {
            title: "Solo Leveling",
            fullTitle: "Jin-Woo’s Shadow Army Debut",
            slug: "solo-leveling-shadows-debut",
            content: "Episode 12’s climax introduces the Shadow Army, marking Jin-Woo’s class change. Visuals shift to a purple-black palette as Igris triggers the loyalty system.",
            imageSearchTerm: "Solo Leveling",
            momentum: 0.98,
            trendReason: "Power debut"
        },
        {
            title: "Kaiju No. 8",
            fullTitle: "Kafka’s Transformation Revealed",
            slug: "kaiju-no8-transformation",
            content: "Kafka’s partial transformation in Episode 4 exposes his identity to Kikoru. The scene emphasizes the contrast between his comedic human form and the kaiju scale.",
            imageSearchTerm: "Kaiju No. 8",
            momentum: 0.92,
            trendReason: "Character reveal"
        }
    ];
}
