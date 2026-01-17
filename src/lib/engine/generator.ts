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

    // Use the first episode's cover image as the main post image
    const primaryEp = episodes[0];
    const mainImage = primaryEp.media.coverImage.extraLarge || primaryEp.media.coverImage.large;

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
        image: mainImage,
        timestamp: date.toISOString(),
        isPublished: true,
        verification_tier: primaryEp.provenance?.tier,
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
    let officialSourceImage = topItem.image;
    if (!officialSourceImage && topItem.imageSearchTerm) {
        try {
            officialSourceImage = await fetchOfficialAnimeImage(topItem.imageSearchTerm);
        } catch (e) {
            console.error('Failed to fetch official image via custom search:', e);
        }
    }

    // HARD RULE: FALLBACK IF NO IMAGE FOUND
    if (!officialSourceImage) {
        console.warn('No official source image found. Using fallback background.');
        // Ensure we always return an image.
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
    let officialSourceImage = trendingItem.image;
    if (!officialSourceImage && trendingItem.imageSearchTerm) {
        officialSourceImage = await fetchOfficialAnimeImage(trendingItem.imageSearchTerm);
    }

    // Universal Image Fallback
    if (!officialSourceImage) {
        console.warn("Trending post missing image. Applying universal fallback.");
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

    // 2. Image validation: allow http URLs and local paths (starting with /)
    if (post.image && !post.image.startsWith('http') && !post.image.startsWith('/')) {
        post.image = undefined; // Fallback to text-only if image fails validation
    }

    return true;
}
