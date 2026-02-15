import * as cheerio from 'cheerio';
import { fetchOfficialAnimeImages } from './fetchers';

// --- CONFIGURATION ---
const MIN_RESOLUTION_SHORT = 700; // Relaxed from 1000 to allow high-quality AniList covers (~460px)
const sharp = require('sharp');

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const TARGET_ASPECT_RATIO = 0.8; // Portrait preferred (Posters), but landscape (Banners) are okay if high res.
// Actually, for social media posts, 4:5 (1080x1350) is target.
// A wide banner (1920x1080) needs to be cropped. A tall poster (2000x3000) is better.

const PREFERRED_DOMAINS = [
    'animenewsnetwork.com', 'crunchyroll.com', 'netflix.com',
    'bilibili.com', 'disneyplus.com', 'twitter.com', 'x.com', 's4.anilist.co'
];

const KUMOLAB_FALLBACK_NEWS = '/hero-bg-final.png';

const BROWSER_UA = () => {
    const uas = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
    ];
    return uas[Math.floor(Math.random() * uas.length)];
};

interface ImageCandidate {
    url: string;
    source: string;
    tier: number; // 1 (Best) to 6 (Worst)
    width: number;
    height: number;
    score: number;
    classification: 'CLEAN' | 'TEXT_HEAVY';
}

/**
 * THE VISUAL INTELLIGENCE ENGINE
 * Selects the absolute best image for a KumoLab post based on strict editorial rules.
 */
export async function selectBestImage(animeTitle: string, context: string = 'General'): Promise<{ url: string, hasText: boolean, classification: 'CLEAN' | 'TEXT_HEAVY' } | null> {
    // 0. Aggressive Search Term Isolation
    // If the title contains "Update", "Reveals", "Canceled", etc., we only want the SUBJECT.
    let cleanSearchTitle = animeTitle
        .replace(/[【】\[\]]/g, '')
        .split(/[:\-\u2013\u2014\u2015]|Update|Reveals|Canceled|Cancelled|Releases|Trailer|Visual|Announces/i)[0]
        .replace(/\s+/g, ' ')
        .trim();

    console.log(`[Image Selector] Hunting for visual assets for: "${cleanSearchTitle}" (Original: "${animeTitle}")`);

    const candidates: ImageCandidate[] = [];

    // --- STRATEGY 1: METADATA RESCUE (AniList) ---
    // We use AniList to get the "Official Site" link and "Banner/Cover"
    const aniListData = await fetchAniListMetadata(cleanSearchTitle);

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

    // --- STRATEGY 2: CLEAN VISUAL SEARCH (Tier 1 Priority) ---
    // Specifically look for "clean" or "artwork" to avoid posters.
    // We treat these as Top Tier (1) because they lead to premium clean visuals.
    const cleanSearchTerms = [
        `${animeTitle} clean artwork scenery`,
        `${animeTitle} background artwork`,
        `${animeTitle} anime scenery 4k`,
        `${animeTitle} production art`
    ];

    for (const term of cleanSearchTerms) {
        if (candidates.length > 20) break;
        await sleep(500);
        const results = await searchRedditImages(term);
        for (const url of results) {
            await processCandidate(url, 'Search: Clean Visual', 1, candidates);
        }
    }

    // --- STRATEGY 3: REDDIT DISCOVERY (Tier 6) ---
    const searchVariations = [
        `${animeTitle} visual`,
        `${animeTitle} official`
    ];

    const redditUrls = new Set<string>();
    for (const variation of searchVariations) {
        if (candidates.length >= 30 && variation !== searchVariations[0]) break;
        await sleep(500);
        const results = await searchRedditImages(variation);
        results.forEach(u => redditUrls.add(u));
    }

    for (const img of redditUrls) {
        await processCandidate(img, 'Reddit Community', 6, candidates);
    }

    // --- SCORING & SELECTION ---
    if (candidates.length === 0) {
        console.warn(`[Image Selector] No valid candidates found for "${animeTitle}". Re-attempting with lower quality gate...`);
        // Re-attempt with much lower gate for official sources only
        if (aniListData) {
            if (aniListData.bannerImage) await processCandidate(aniListData.bannerImage, 'AniList Banner (Fallback)', 3, candidates, 300);
            if (aniListData.coverImage?.extraLarge) await processCandidate(aniListData.coverImage.extraLarge, 'AniList Cover (Fallback)', 3, candidates, 300);
        }
    }

    if (candidates.length === 0) {
        console.warn(`[Image Selector] Absolute failure: No visuals for "${animeTitle}". Using branded fallback.`);
        return {
            url: KUMOLAB_FALLBACK_NEWS,
            hasText: false,
            classification: 'CLEAN'
        };
    }

    // Sort by Score (Desc)
    candidates.sort((a, b) => b.score - a.score);

    // DYNAMIC RE-ROLL: If the winner is a poster but a decent cleaner visual exists, prefer the clean visual
    const winner = candidates[0];
    const isWinnerPoster = winner.score < 80 && (winner.source.includes('Poster') || winner.source.includes('Cover') || winner.source.includes('Official Website'));

    if (isWinnerPoster) {
        const cleanerAlternative = candidates.find(c => c.score > 60 && !c.source.includes('Poster') && !c.source.includes('Cover'));
        if (cleanerAlternative) {
            console.log(`[Image Selector] REROLL: Dropping poster winner (${winner.source}) for cleaner visual (${cleanerAlternative.source})`);
            return { url: cleanerAlternative.url, hasText: false, classification: 'CLEAN' };
        }
    }

    console.log(`[Image Selector] Winner: ${winner.source} (${winner.width}x${winner.height}) Score: ${winner.score.toFixed(1)}`);
    console.log(`[Image Selector] Asset: ${winner.url}`);

    // IMAGE CLASSIFICATION (Bucket 1 vs Bucket 2)
    // Rule: Anything that isn't explicitly penalized as a poster or from a text-heavy source is CLEAN.
    const classification = winner.classification;
    const hasText = classification === 'TEXT_HEAVY';

    return {
        url: winner.url,
        hasText,
        classification
    };
}

// --- HELPERS ---

async function processCandidate(url: string, source: string, tier: number, list: ImageCandidate[], customMinRes?: number) {
    if (!url) return;

    // 1. Check if already processed
    if (list.some(c => c.url === url)) return;

    // 2. Technical Validation (Download Header/Buffer)
    try {
        const metadata = await validateImageQuality(url, customMinRes);
        if (!metadata) return; // Failed quality gate

        const { width, height, buffer } = metadata;

        // 3. Scoring Logic
        // Base Score from Tier (Lower tier # is better)
        let score = 100 - ((tier - 1) * 10);

        // Aspect Ratio Check
        const aspect = width / height;

        // --- HARD REJECT: Split Panels / Stitched Halves ---
        // Rule: If an image is extremely wide or tall, it is likely a composite.
        // Rule: Follow 4:3 subject-safe rules (0.7 to 1.5 aspect range).
        if (aspect > 1.6 || aspect < 0.6) {
            console.log(`[Image Selector] REJECT: Aspect ratio ${aspect.toFixed(2)} violates single-frame 4:3 subject-safe rules.`);
            return;
        }

        const isPortrait = aspect < 1;

        // HEURISTIC: Penalize Posters/Covers
        // Posters are usually portrait and come from official sources or have "Poster" in the name.
        const isLikelyPoster = (isPortrait && (source.includes('AniList Cover') || source.includes('Official Website'))) ||
            source.includes('Poster') || source.includes('Visual');

        if (isLikelyPoster) {
            // Strong penalty for being a text-heavy poster
            score -= 30;
            console.log(`[Image Selector] Penalizing poster: ${source} (Aspect: ${aspect.toFixed(2)})`);
        } else {
            // Bonus for horizontal/wide visuals (usually clean scenery or banners)
            if (aspect > 1.2) {
                score += 15;
            }
        }

        const resScore = Math.min(width, 4000) / 200;
        // Classification Heuristic
        const textHeavyKeywords = ['poster', 'visual', 'magazine', 'trailer', 'screenshot', 'cover', 'official website'];
        const cleanKeywords = ['clean', 'artwork', 'scenery', 'background', 'banner', 'conceptual', 'production art'];

        const lowerSource = source.toLowerCase();
        const lowerUrl = url.toLowerCase();

        let classification: 'CLEAN' | 'TEXT_HEAVY' = 'CLEAN';

        // Default to TEXT_HEAVY for covers and official sites unless "clean" is present
        if (lowerSource.includes('cover') || lowerSource.includes('official website')) {
            classification = 'TEXT_HEAVY';
        }

        // Override based on keywords
        if (cleanKeywords.some(k => lowerSource.includes(k) || lowerUrl.includes(k))) {
            classification = 'CLEAN';
        }

        if (textHeavyKeywords.some(k => (lowerSource.includes(k) && !cleanKeywords.some(ck => lowerSource.includes(ck))) ||
            (lowerUrl.includes(k) && !cleanKeywords.some(ck => lowerUrl.includes(ck))))) {
            if (!lowerSource.includes('clean') && !lowerUrl.includes('clean')) {
                classification = 'TEXT_HEAVY';
            }
        }

        // Banners are almost always clean
        if (lowerSource.includes('banner')) classification = 'CLEAN';

        // --- VISUAL OVERRIDE PASS (Bucket 2 -> Bucket 1) ---
        // If it was marked TEXT_HEAVY, check if it's actually clean based on visual entropy.
        if (classification === 'TEXT_HEAVY') {
            const isCleanVisual = await performVisualOverride(buffer);
            if (isCleanVisual) {
                console.log(`[Image Selector] Visual Override: Reclassifying "${source}" as CLEAN.`);
                classification = 'CLEAN';
            }
        }

        list.push({ url, source, tier, width, height, score, classification });

    } catch (e: any) {
        // Silent fail on invalid URLs
        console.warn(`[Image Selector] Failed to process candidate ${url}:`, e?.message || String(e));
    }
}

/**
 * Downloads image buffer to check exact dimensions.
 * Rejects < 700px on shortest side (Relaxed from 1000).
 */
async function validateImageQuality(url: string, customMinRes?: number): Promise<{ width: number, height: number, buffer: Buffer } | null> {
    try {
        const minRes = customMinRes || MIN_RESOLUTION_SHORT;
        const res = await fetch(url, {
            headers: { 'User-Agent': BROWSER_UA() }
        });
        if (!res.ok) {
            console.log(`[Image Selector] Fetch failed for ${url}: ${res.status}`);
            return null;
        }

        const buffer = Buffer.from(await res.arrayBuffer());
        const meta = await sharp(buffer).metadata();

        if (!meta.width || !meta.height) return null;

        const shortest = Math.max(meta.width, meta.height); // Use LONGEST side for fallback gate if needed? No, let's keep shortest but lower it.
        const actualShortest = Math.min(meta.width, meta.height);

        // STRICT QUALITY GATE
        if (actualShortest < minRes) {
            console.log(`[Image Selector] Asset too small: ${url} (${meta.width}x${meta.height})`);
            return null;
        }

        return { width: meta.width, height: meta.height, buffer };
    } catch (e: any) {
        console.warn(`[Image Selector] sharp/fetch error for ${url}:`, e?.message || String(e));
        return null;
    }
}

async function scrapeOgImage(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': BROWSER_UA() }
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

        // --- VALIDATION PASS ---
        // Ensure the search result actually relates to our topic
        const searchNorm = title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const engNorm = (media.title.english || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const romNorm = (media.title.romaji || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        const isMatch = engNorm.includes(searchNorm) || romNorm.includes(searchNorm) ||
            searchNorm.includes(engNorm) || searchNorm.includes(romNorm);

        if (!isMatch && searchNorm.length > 2) {
            console.warn(`[Image Selector] AniList Title Mismatch: Expected "${title}", got "${media.title.english || media.title.romaji}". rejecting.`);
            return null;
        }

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
        let res = await fetch(`https://www.reddit.com/r/anime/search.json?q=${query}&restrict_sr=1&sort=relevance&limit=5`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://www.reddit.com/r/anime/'
            }
        });

        if (res.status === 429) {
            console.warn(`[Reddit Search] Rate limited (429) for "${term}". Waiting 5s...`);
            await sleep(5000);
            res = await fetch(`https://www.reddit.com/r/anime/search.json?q=${query}&restrict_sr=1&sort=relevance&limit=5`, {
                headers: { 'User-Agent': BROWSER_UA() }
            });
        }

        if (!res.ok) {
            console.warn(`[Reddit Search] HTTP Error ${res.status} for "${term}"`);
            return [];
        }

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            console.warn(`[Reddit Search] Non-JSON response for "${term}" (${contentType})`);
            return [];
        }

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

/**
 * THE VISUAL OVERRIDE PASS
 * Analyzes an image buffer to see if it qualifies as CLEAN despite its source.
 */
async function performVisualOverride(buffer: Buffer): Promise<boolean> {
    try {
        const image = sharp(buffer);
        const metadata = await image.metadata();
        const { width, height } = metadata;
        if (!width || !height) return false;

        // 1. Low-entropy background Check (Split into 3x3 for speed)
        const cellW = Math.floor(width / 3);
        const cellH = Math.floor(height / 3);
        let lowEntropyCount = 0;

        const regions = [];
        for (let y = 0; y < 3; y++) {
            for (let x = 0; x < 3; x++) {
                regions.push({ left: x * cellW, top: y * cellH, width: cellW, height: cellH });
            }
        }

        // We use sharp to extract stats from each region
        // This confirms if large portions of the image are "flat" (sky, grass, scenery)
        const statsResults = await Promise.all(regions.map(r =>
            sharp(buffer).extract(r).stats()
        ));

        statsResults.forEach(s => {
            // Threshold: 6.8 is the same as the safe-zone detection in image-processor.ts
            if (s.entropy < 6.8) lowEntropyCount++;
        });

        // Rule: At least ~50% of the frame is low-entropy background
        const isMostlyScenery = lowEntropyCount >= 4; // 4 out of 9 is ~44%, close enough to "at least ~50%"

        // 2. Central 50% Text Check
        const center = await sharp(buffer).extract({
            left: Math.floor(width * 0.25),
            top: Math.floor(height * 0.25),
            width: Math.floor(width * 0.5),
            height: Math.floor(height * 0.5)
        }).stats();

        // Large embedded text creates high local entropy (> 7.6)
        // Clean scenery or character foreground usually stays under 7.4
        const centralTextHeavy = center.entropy > 7.6;

        // 3. Corner Logo Check (Checking 4 corners for prominent burned-in logos)
        const cornerSize = 0.15;
        const cornerRegions = [
            { left: 0, top: 0, width: Math.floor(width * cornerSize), height: Math.floor(height * cornerSize) }, // TL
            { left: Math.floor(width * (1 - cornerSize)), top: 0, width: Math.floor(width * cornerSize), height: Math.floor(height * cornerSize) }, // TR
            { left: 0, top: Math.floor(height * (1 - cornerSize)), width: Math.floor(width * cornerSize), height: Math.floor(height * cornerSize) }, // BL
            { left: Math.floor(width * (1 - cornerSize)), top: Math.floor(height * (1 - cornerSize)), width: Math.floor(width * cornerSize), height: Math.floor(height * cornerSize) } // BR
        ];

        const cornerStats = await Promise.all(cornerRegions.map(r => sharp(buffer).extract(r).stats()));
        const hasProminentLogo = cornerStats.some(s => s.entropy > 7.5);

        // Final Logic Gate
        // CLEAN if (Low Entropy BG AND No Central Text AND No Prominent Logos)
        if (isMostlyScenery && !centralTextHeavy && !hasProminentLogo) {
            return true;
        }

        return false;
    } catch (e) {
        console.warn(`[Visual Override] Pass failed:`, e);
        return false;
    }
}
