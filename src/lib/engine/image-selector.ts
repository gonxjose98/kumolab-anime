
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import { fetchOfficialAnimeImages } from './fetchers';

// --- CONFIGURATION ---
const MIN_RESOLUTION_SHORT = 450; // Relaxed from 1000 to allow high-quality AniList covers (~460px)
const TARGET_ASPECT_RATIO = 0.8; // Portrait preferred (Posters), but landscape (Banners) are okay if high res.
// Actually, for social media posts, 4:5 (1080x1350) is target. 
// A wide banner (1920x1080) needs to be cropped. A tall poster (2000x3000) is better.

const PREFERRED_DOMAINS = [
    'animenewsnetwork.com', 'crunchyroll.com', 'netflix.com',
    'bilibili.com', 'disneyplus.com', 'twitter.com', 'x.com', 's4.anilist.co'
];

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface ImageCandidate {
    url: string;
    source: string;
    tier: number; // 1 (Best) to 6 (Worst)
    width: number;
    height: number;
    score: number;
}

/**
 * THE VISUAL INTELLIGENCE ENGINE
 * Selects the absolute best image for a KumoLab post based on strict editorial rules.
 */
export async function selectBestImage(animeTitle: string, context: string = 'General'): Promise<{ url: string, hasText: boolean } | null> {
    console.log(`[Image Selector] Hunting for visual assets for: "${animeTitle}"`);

    const candidates: ImageCandidate[] = [];

    // --- STRATEGY 1: METADATA RESCUE (AniList) ---
    // We use AniList to get the "Official Site" link and "Banner/Cover"
    const aniListData = await fetchAniListMetadata(animeTitle);

    if (aniListData) {
        // A. Official Database Visuals (Tier 3)
        // High reliability, medium freshness
        if (aniListData.bannerImage) await processCandidate(aniListData.bannerImage, 'AniList Banner', 3, candidates);
        if (aniListData.coverImage?.extraLarge) await processCandidate(aniListData.coverImage.extraLarge, 'AniList Cover', 3, candidates);

        // B. Official Website Crawl (Tier 1)
        // Highest freshness (the actual source of truth)
        const officialSite = aniListData.siteUrl; // Actually externalLinks
        if (officialSite) {
            console.log(`[Image Selector] Crawling Official Site: ${officialSite}`);
            const siteImage = await scrapeOgImage(officialSite);
            if (siteImage) await processCandidate(siteImage, 'Official Website (OG)', 1, candidates);
        }
    }

    // --- STRATEGY 2: REDDIT DISCOVERY (Tier 6) ---
    const searchVariations = [
        `${animeTitle} visual`,
        `${animeTitle} official`,
        `${animeTitle} poster`,
        animeTitle
    ];

    const redditUrls = new Set<string>();
    for (const variation of searchVariations) {
        if (candidates.length >= 10 && variation !== searchVariations[0]) break;
        const results = await searchRedditImages(variation);
        results.forEach(u => redditUrls.add(u));
    }

    for (const img of redditUrls) {
        await processCandidate(img, 'Reddit Community', 6, candidates);
    }

    // --- SCORING & SELECTION ---
    if (candidates.length === 0) {
        console.warn(`[Image Selector] No valid candidates found for "${animeTitle}".`);
        return null;
    }

    // Sort by Score (Desc)
    candidates.sort((a, b) => b.score - a.score);

    const winner = candidates[0];
    console.log(`[Image Selector] Winner: ${winner.source} (${winner.width}x${winner.height}) Score: ${winner.score.toFixed(1)}`);
    console.log(`[Image Selector] Asset: ${winner.url}`);

    // HEURISTIC TEXT DETECTION
    // Cover images, Posters, and Official Site OG images almost always have the logo/title on them.
    const sourcesWithText = ['AniList Cover', 'Official Website (OG)'];
    const isLikelyPoster = winner.source.includes('Poster') || winner.source.includes('Visual');
    const hasText = sourcesWithText.includes(winner.source) || isLikelyPoster;

    return {
        url: winner.url,
        hasText
    };
}

// --- HELPERS ---

async function processCandidate(url: string, source: string, tier: number, list: ImageCandidate[]) {
    if (!url) return;

    // 1. Check if already processed
    if (list.some(c => c.url === url)) return;

    // 2. Technical Validation (Download Header/Buffer)
    try {
        const metadata = await validateImageQuality(url);
        if (!metadata) return; // Failed quality gate

        const { width, height } = metadata;

        // 3. Scoring Logic
        // Base Score from Tier (Lower tier # is better, so logical inversion)
        // Tier 1 = 100, Tier 2 = 90 ... Tier 6 = 50
        let score = 100 - ((tier - 1) * 10);

        // Resolution Bonus (Up to +20)
        // Reward 4K (3840) vs 1080p
        // Cap width to 4000 for calc
        const resScore = Math.min(width, 4000) / 200;
        score += resScore;

        // Aspect Ratio Penalty
        // We prefer Portrait (~0.7-0.9) or Wide (~1.7)
        // We dislike Square (1.0) or super tall skyscrapers
        const aspect = width / height;

        // If it's a "Banner" (usually wide), it might get cropped. 
        // A massive banner is good. A tiny banner is bad.
        // If aspect > 2, penalty? No, banners are cool.

        // Penalize very small images heavily (Double check)
        // (Managed by validateImageQuality min check)

        list.push({ url, source, tier, width, height, score });

    } catch (e: any) {
        // Silent fail on invalid URLs
        console.warn(`[Image Selector] Failed to process candidate ${url}:`, e?.message || String(e));
    }
}

/**
 * Downloads image buffer to check exact dimensions.
 * Rejects < 1000px on shortest side (Strict Rule).
 */
async function validateImageQuality(url: string): Promise<{ width: number, height: number } | null> {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': BROWSER_UA }
        });
        if (!res.ok) {
            console.log(`[Image Selector] Fetch failed for ${url}: ${res.status}`);
            return null;
        }

        const buffer = Buffer.from(await res.arrayBuffer());
        const meta = await sharp(buffer).metadata();

        if (!meta.width || !meta.height) return null;

        const shortest = Math.min(meta.width, meta.height);

        // STRICT QUALITY GATE
        if (shortest < MIN_RESOLUTION_SHORT) {
            // Relaxing for very specific cases could be done here, but let's keep it for now
            // Unless we have ZERO candidates, we might want to reconsider.
            return null;
        }

        return { width: meta.width, height: meta.height };
    } catch (e: any) {
        console.warn(`[Image Selector] sharp/fetch error for ${url}:`, e?.message || String(e));
        return null;
    }
}

async function scrapeOgImage(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KumoLabbot/1.0)' }
        });
        if (!res.ok) return null;
        const html = await res.text();
        const $ = cheerio.load(html);
        return $('meta[property="og:image"]').attr('content') || null;
    } catch (e) {
        return null;
    }
}

async function fetchAniListMetadata(title: string): Promise<any> {
    const query = `
        query ($search: String) {
            Media (search: $search, type: ANIME, sort: SEARCH_MATCH) {
                id
                bannerImage
                coverImage { extraLarge }
                siteUrl
                externalLinks { site url }
            }
        }
    `;
    try {
        const res = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, variables: { search: title } })
        });
        const json = await res.json();
        const media = json.data?.Media;

        if (!media) return null;

        // Extract Official Site from external links if available
        const officialLink = media.externalLinks?.find((l: any) => l.site === 'Official Site');
        const siteUrl = officialLink ? officialLink.url : media.siteUrl; // Fallback to AniList page if needed? No, siteUrl on Media object isn't "Official Site", it's the AniList page usually? No, Media.siteUrl is deprecated or specific field? 
        // Actually Media.siteUrl is "The url for the media page on the AniList website". We want 'externalLinks'.

        return {
            ...media,
            siteUrl: officialLink ? officialLink.url : null
        };
    } catch (e) {
        return null;
    }
}

async function searchRedditImages(term: string): Promise<string[]> {
    try {
        // Search for "Title + Visual"
        const query = encodeURIComponent(`${term} visual`);
        const res = await fetch(`https://www.reddit.com/r/anime/search.json?q=${query}&restrict_sr=1&sort=relevance&limit=5`, {
            headers: { 'User-Agent': 'KumoLab-Bot/1.0' }
        });
        const json = await res.json();
        const posts = json.data?.children || [];

        const images: string[] = [];
        for (const post of posts) {
            const d = post.data;
            // Provenance Check: Is it an image?
            // Allow reddit, imgur, and generic high-traffic static hosts
            const url = d.url || '';
            if (url && (url.includes('redd.it') || url.includes('imgur.com') || url.includes('static'))) {
                // Ignore gifs?
                if (!url.endsWith('.gif') && !url.endsWith('.gifv') && !url.includes('external-preview')) {
                    images.push(url);
                }
            }
        }
        return images;
    } catch (e: any) {
        console.error(`[Reddit Search] Error for ${term}:`, e?.message || String(e));
        return [];
    }
}
