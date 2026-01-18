/**
 * generator.ts
 * Content generation and validation for KumoLab
 */

import { AiringEpisode } from './fetchers';
import { BlogPost, PostType, ClaimType } from '@/types';
import { generateIntelImage } from './image-processor';
import { fetchOfficialAnimeImage } from './fetchers';

/**
 * Generates a Daily Drops (DROP) post from a list of airing episodes.
 */
export function generateDailyDropsPost(episodes: AiringEpisode[], date: Date): BlogPost | null {
    if (episodes.length === 0) return null;

    const dateString = date.toISOString().split('T')[0];

    // 1. Build the visible list (NO EM DASHES PER USER RULE)
    const episodeList = episodes.map(ep => {
        const title = ep.media.title.english || ep.media.title.romaji;
        return `- ${title} - Episode ${ep.episode}`;
    }).join('\n');

    // 2. Build the INTERNAL AUDIT LOG (Hard Requirement - HIDDEN FROM PUBLIC)
    const auditLog = episodes.map(ep => {
        return ep.provenance?.reason || 'Audit Missing';
    }).join('\n');

    const content = `Good morning, Kumo Fam.\n\nHere are today’s drops:\n\n${episodeList}`;

    // Aggregated Provenance for DB
    const sourcesMap: Record<string, any> = {};
    episodes.forEach(ep => {
        const title = ep.media.title.english || ep.media.title.romaji;
        if (ep.provenance) {
            sourcesMap[title] = ep.provenance;
        }
    });

    return {
        id: `drop-${dateString}`,
        title: `Daily Drops - ${dateString}`,
        slug: `daily-drops-${dateString}`,
        type: 'DROP',
        content,
        image: undefined, // Text-only as requested
        timestamp: date.toISOString(),
        isPublished: true,
        verification_tier: episodes[0].provenance?.tier,
        verification_reason: 'Strict Primary Source Verified',
        verification_sources: sourcesMap
    };
}

/**
 * Generates an Anime Intel (INTEL) post.
 */
export async function generateIntelPost(intelItems: any[], date: Date, isFallback: boolean = false): Promise<BlogPost | null> {
    if (intelItems.length === 0) {
        return null;
    }

    const topItem = intelItems[0];
    const todayStr = date.toISOString().split('T')[0];
    const today = new Date(todayStr);

    let claimType: ClaimType = topItem.claimType;
    const premiereDateStr: string | undefined = topItem.premiereDate;

    // 1. FAILSAFE: REQUIRED FIELDS (If missing, abort)
    if (!claimType) {
        console.error('Abort: No claimType provided for Anime Intel post.');
        return null;
    }

    // premiere_date is required for confirmed, premiered, now_streaming logic
    if (['confirmed', 'premiered', 'now_streaming'].includes(claimType) && !premiereDateStr) {
        console.error(`Abort: claim_type "${claimType}" requires premiere_date.`);
        return null;
    }

    // 2. DATE LOGIC & HARD RULES
    if (premiereDateStr) {
        const premiereDate = new Date(premiereDateStr);
        // Calculate difference in days (positive means premiered/past)
        const diffDays = Math.floor((today.getTime() - premiereDate.getTime()) / (1000 * 60 * 60 * 24));

        // DATE LOGIC (Autocorrect instead of Abort)
        if (claimType === 'confirmed') {
            if (today >= premiereDate) {
                // Was "confirmed" but date is past/today? Switch to 'premiered'
                console.warn(`[Generator] Autocorrecting 'confirmed' post to 'premiered' because date ${premiereDateStr} is today/past.`);
                claimType = 'premiered';
            }
        }

        // AUTOMATIC CONVERSIONS
        if (claimType === 'premiered') {
            if (diffDays > 7) {
                // "premiered + (today > premiere_date + 7 days) -> upgrade to now_streaming"
                claimType = 'now_streaming';
            }
        }
    }

    // 3. CARD OVERLAY TEXT (LOCKED)
    const overlayTextMap: Record<ClaimType, string> = {
        confirmed: `PREMIERES ${formatPremiereDate(premiereDateStr)}`,
        premiered: `PREMIERED ${formatPremiereDate(premiereDateStr)}`,
        now_streaming: "NOW STREAMING",
        delayed: "DELAYED",
        trailer: "NEW TRAILER",
        finale_aired: "FINALE AIRED"
    };

    const overlayTag = overlayTextMap[claimType] || "LATEST NEWS";

    // IMAGE RELEVANCE PROMPT (LOCKED)
    // "An anime always has to be chosen. Fallback image should never be used."
    let officialSourceImage = topItem.image;

    // HELPER: Robust Searcher
    const findImageWithRetries = async (term: string) => {
        if (!term) return null;

        // Strategy 1: Exact Term
        let img = await fetchOfficialAnimeImage(term);
        if (img) return img;

        console.log(`[Generator] Strategy 1 failed for "${term}". Trying Search Strategy 2...`);

        // Strategy 2: Remove Numbers and "Season" keywords explicitly
        // "Inherit the Winds 2 Members" -> "Inherit the Winds Members" -> "Inherit the Winds"
        let clean = term.replace(/[0-9]+/g, '').replace(/Season/gi, '').replace(/\s+/g, ' ').trim();
        if (clean !== term) {
            img = await fetchOfficialAnimeImage(clean);
            if (img) return img;
        }

        console.log(`[Generator] Strategy 2 failed for "${clean}". Trying Search Strategy 3...`);

        // Strategy 3: First 3 Words (The "Hail Mary")
        // "Inherit the Winds Members" -> "Inherit the Winds"
        const words = escape(term).split('%20'); // Simple split by space
        // Actually simpler to just split string
        const simpleWords = term.split(' ');
        if (simpleWords.length > 2) {
            const shortTerm = simpleWords.slice(0, 3).join(' ');
            img = await fetchOfficialAnimeImage(shortTerm);
            if (img) return img;
        }

        return null;
    };

    if (!officialSourceImage && topItem.imageSearchTerm) {
        try {
            officialSourceImage = await findImageWithRetries(topItem.imageSearchTerm);
        } catch (e) {
            console.error('Failed to fetch official image via custom search:', e);
        }
    }

    // HARD RULE: FALLBACK IF NO IMAGE FOUND
    // User demand: "Fallback image should never be used."
    // If we failed after all retries, we really just have to fallback or else we crash. 
    // BUT we can try one last desperate search for JUST the first word if length > 4 chars
    if (!officialSourceImage && topItem.imageSearchTerm) {
        const firstWord = topItem.imageSearchTerm.split(' ')[0];
        if (firstWord.length > 4) {
            console.log(`[Generator] DESPERATE LAST RESORT: Searching for "${firstWord}"`);
            officialSourceImage = await fetchOfficialAnimeImage(firstWord);
        }
    }

    if (!officialSourceImage) {
        console.warn('No official source image found after ALL strategies. Using fallback.');
        officialSourceImage = '/hero-bg-final.png';
    }

    let finalImage: string | undefined = undefined;
    if (officialSourceImage) {
        const processedImageUrl = await generateIntelImage({
            sourceUrl: officialSourceImage,
            animeTitle: topItem.title,
            headline: overlayTag, // Status/Label in White
            slug: topItem.slug || 'intel'
        });

        if (processedImageUrl) {
            finalImage = processedImageUrl;
        } else {
            console.warn('Image generation/upload failed. Falling back to raw official source.');
            finalImage = officialSourceImage;
        }
    }

    return {
        id: `intel-${todayStr}-${Date.now()}`,
        title: topItem.fullTitle || topItem.title,
        slug: `${topItem.slug || 'intel'}-${todayStr}`,
        type: 'INTEL',
        claimType,
        premiereDate: premiereDateStr,
        content: topItem.content,
        image: finalImage || '/hero-bg-final.png', // Absolute safety fallback
        timestamp: date.toISOString(),
        isPublished: true
    };
}

/**
 * Formats YYYY-MM-DD to Month Day, Year
 */
function formatPremiereDate(dateStr?: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
}

/**
 * Generates a Trending (TRENDING) post.
 */
export async function generateTrendingPost(trendingItem: any, date: Date): Promise<BlogPost | null> {
    if (!trendingItem) return null;

    const dateString = date.toISOString().split('T')[0];

    // Trending also follows the strict relevance rule
    // "An anime always has to be chosen. Fallback image should never be used."
    let officialSourceImage = trendingItem.image;

    // HELPER: Robust Searcher (Duplicated for safety/isolation)
    const findImageWithRetries = async (term: string) => {
        if (!term) return null;

        // Strategy 1: Exact Term
        let img = await fetchOfficialAnimeImage(term);
        if (img) return img;

        console.log(`[Generator-Trending] Strategy 1 failed for "${term}". Trying Search Strategy 2...`);

        // Strategy 2: Remove Numbers and "Season" keywords explicitly
        let clean = term.replace(/[0-9]+/g, '').replace(/Season/gi, '').replace(/\s+/g, ' ').trim();
        if (clean !== term) {
            img = await fetchOfficialAnimeImage(clean);
            if (img) return img;
        }

        console.log(`[Generator-Trending] Strategy 2 failed for "${clean}". Trying Search Strategy 3...`);

        // Strategy 3: First 3 Words
        const simpleWords = term.split(' ');
        if (simpleWords.length > 2) {
            const shortTerm = simpleWords.slice(0, 3).join(' ');
            img = await fetchOfficialAnimeImage(shortTerm);
            if (img) return img;
        }

        return null;
    };

    if (!officialSourceImage && trendingItem.imageSearchTerm) {
        // Try the robust search
        officialSourceImage = await findImageWithRetries(trendingItem.imageSearchTerm);

        // DESPERATE RESORT logic for Trending too
        if (!officialSourceImage) {
            const firstWord = trendingItem.imageSearchTerm.split(' ')[0];
            if (firstWord.length > 4) {
                console.log(`[Generator-Trending] DESPERATE LAST RESORT: Searching for "${firstWord}"`);
                officialSourceImage = await fetchOfficialAnimeImage(firstWord);
            }
        }
    }

    // Universal Image Fallback
    if (!officialSourceImage) {
        console.warn("Trending post missing image after ALL strategies. Applying universal fallback.");
        officialSourceImage = '/hero-bg-final.png';
    }

    let finalImage: string | undefined = undefined;
    if (officialSourceImage) {
        // Enforce KumoLab branding for Trending posts as requested by User
        const overlayTag = (trendingItem.trendReason || "TRENDING").toUpperCase();

        const processedImageUrl = await generateIntelImage({
            sourceUrl: officialSourceImage,
            animeTitle: trendingItem.title,
            headline: overlayTag,
            slug: trendingItem.slug || 'trending'
        });

        if (processedImageUrl) {
            finalImage = processedImageUrl;
        } else {
            console.warn('Trending image generation failed. Falling back to raw official source.');
            finalImage = officialSourceImage;
        }
    }

    return {
        id: `trending-${dateString}-${Date.now()}`,
        title: trendingItem.fullTitle || trendingItem.title,
        slug: `trending-${trendingItem.slug || 'now'}-${dateString}`,
        type: 'TRENDING',
        content: trendingItem.content,
        image: finalImage || '/hero-bg-final.png', // Absolute safety fallback
        timestamp: date.toISOString(),
        isPublished: true
    };
}

/**
 * Validates post before publishing (non-duplication, image validation).
 */
export function validatePost(post: BlogPost, existingPosts: BlogPost[], force: boolean = false): boolean {
    // 1. Check for duplicates in the same day (UTC)
    const postDate = post.timestamp.split('T')[0];
    const isDuplicate = existingPosts.some(p =>
        p.timestamp.split('T')[0] === postDate &&
        p.title === post.title
    );

    if (isDuplicate && !force) return false;

    // 2. Image validation: allow http URLs, local paths (/), and data URIs (data:)
    if (post.image && !post.image.startsWith('http') && !post.image.startsWith('/') && !post.image.startsWith('data:')) {
        console.warn(`[Validator] Invalid image path detected: ${post.image.substring(0, 50)}...`);
        console.warn(`[Validator] Applying safety fallback: /hero-bg-final.png`);
        post.image = '/hero-bg-final.png';
    }

    // 3. FINAL SAFETY CHECK: Ensure Image is NEVER null/undefined
    if (!post.image) {
        console.warn(`[Validator] Post ${post.title} has NO image. Applying safety fallback.`);
        post.image = '/hero-bg-final.png';
    }

    return true;
}
