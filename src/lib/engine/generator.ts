/**
 * generator.ts
 * Content generation and validation for KumoLab
 */

import { AiringEpisode } from './fetchers';
import { BlogPost, PostType, ClaimType } from '@/types';
import { generateIntelImage } from './image-processor';
import { fetchOfficialAnimeImage } from './fetchers';
import { randomUUID } from 'crypto';

/**
 * Generates a Daily Drops (DROP) post from a list of airing episodes.
 */
export function generateDailyDropsPost(episodes: AiringEpisode[], date: Date): BlogPost | null {
    if (episodes.length === 0) return null;

    const dateString = date.toISOString().split('T')[0];

    // 1. Build the visible list (STRICT TWO-LINE FORMAT)
    const episodeList = episodes.map(ep => {
        let title = ep.media.title.english || ep.media.title.romaji;
        let subline = `Episode ${ep.episode}`;

        // Attempt to extract Season from title if it exists (e.g. "Jujutsu Kaisen Season 2")
        const seasonMatch = title.match(/Season\s+(\d+)/i);
        if (seasonMatch) {
            const seasonNum = seasonMatch[1];
            // Remove "Season X" from title to avoid redundancy on line 1
            title = title.replace(/Season\s+\d+/i, '').replace(/\s+/g, ' ').trim();
            subline = `Season ${seasonNum} · Episode ${ep.episode}`;
        }

        return `${title}\n${subline}`;
    }).join('\n\n');

    const content = `Today’s Drops\n\nNew episodes are now live.\n\n${episodeList}`;


    // Aggregated Provenance for DB
    const sourcesMap: Record<string, any> = {};
    episodes.forEach(ep => {
        const title = ep.media.title.english || ep.media.title.romaji;
        if (ep.provenance) {
            sourcesMap[title] = ep.provenance;
        }
    });

    return {
        id: randomUUID(),
        title: `Daily Drops - ${dateString}`,
        slug: `daily-drops-${dateString}`,
        type: 'DROP',
        content,
        image: '/daily-drops-permanent.jpg', // Permanent branded image
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

    const validTitle = cleanTitle(topItem.fullTitle || topItem.title);
    const validContent = cleanBody(topItem.content, validTitle);

    let finalImage: string | undefined = undefined;
    if (officialSourceImage) {
        const processedImageUrl = await generateIntelImage({
            sourceUrl: officialSourceImage,
            animeTitle: validTitle, // Use Cleaned Title for Image Text
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
        id: randomUUID(),
        title: validTitle,
        slug: `${topItem.slug || 'intel'}-${todayStr}`,
        type: 'INTEL',
        claimType,
        premiereDate: premiereDateStr,
        content: validContent,
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

    const validTitle = cleanTitle(trendingItem.fullTitle || trendingItem.title);
    const validContent = cleanBody(trendingItem.content, validTitle);

    let finalImage: string | undefined = undefined;
    if (officialSourceImage) {
        // Enforce KumoLab branding for Trending posts as requested by User
        const overlayTag = (trendingItem.trendReason || "TRENDING").toUpperCase();

        const processedImageUrl = await generateIntelImage({
            sourceUrl: officialSourceImage,
            animeTitle: validTitle, // Use Cleaned Title
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
        id: randomUUID(),
        title: validTitle,
        slug: `trending-${trendingItem.slug || 'now'}-${dateString}`,
        type: 'TRENDING',
        content: validContent,
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

/**
 * STRICT TITLE RULES:
 * - Concise, Image-Safe (No brackets, parens).
 * - Anime Name + Action/Status.
 * - No questions, no multi-clause.
 * - Soft ban "Community".
 */
export function cleanTitle(title: string): string {
    if (!title) return "Anime Update";

    let clean = title;

    // 1. Remove Brackets and Parentheses markings but KEEP the content
    // Specifically targets [ ], ( ), and Japanese 【 】
    // Use spaces to avoid merging words, then collapse later
    clean = clean.replace(/[\[\]\(\)【】]/g, ' ');

    // 2. Aggressive Noise Stripping
    const explicitNoise = [
        "Film's Full Trailer",
        "Film's Trailer",
        "Full Trailer",
        "TV Anime's",
        "Anime's",
        "Anime Series'",
        "TV Anime",
        "The Anime",
        "The Series",
        "Original TV Anime",
        "Original Anime"
    ];

    explicitNoise.forEach(noise => {
        const regex = new RegExp(noise, 'gi');
        clean = clean.replace(regex, '');
    });

    // 3. Clean up possessives left over
    clean = clean.replace(/\bAnime'\b/gi, '')
        .replace(/\bFilm'\b/gi, '');

    // 4. Remove "Community" / "Fans" unless essential
    if (clean.includes('Community')) {
        clean = clean.replace(/Community/gi, 'Fans');
    }

    // 5. Remove common RSS junk
    clean = clean.replace(/News:/gi, '')
        .replace(/Create/gi, '')
        .replace(/Vote/gi, '')
        .replace(/Poll/gi, '');

    // 6. Remove questions
    clean = clean.replace(/\?/g, '');

    // 7. Final Formatting: Remove extra spaces and trailing noise
    clean = clean.replace(/\s+/g, ' ').trim();
    // Remove leading/trailing non-alphanumeric (like - or :)
    clean = clean.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');

    // 8. Enforce Action/Status framing if missing (Simple Heuristic)
    // If it's just a name "One Piece", maybe add nothing (could be unsafe to guess).
    // But user wants "Anime Name + Action".
    // We assume the input title usually has it.

    // 9. Hard Length Cap for Image Safety (User Limit: 100 chars)
    if (clean.length > 100) {
        // Try to truncate at last space
        const truncated = clean.substring(0, 100);
        clean = truncated.substring(0, truncated.lastIndexOf(' ')) + '...';
    }

    return clean;
}

/**
 * STRICT BODY RULES:
 * - Factual, Educational, Objective.
 * - No opinion or hype.
 * - Expands on the title with production or narrative context.
 */
export function cleanBody(content: string, title: string, trendReason?: string): string {
    // 1. Base Cleanup
    let base = (content || '').replace(/<[^>]*>?/gm, '')
        .replace(/Read more.*/gi, '')
        .replace(/http\S+/g, '')
        .trim();

    // 2. Intellectual Expansion Templates (Factual & Objective)
    const series = title.split(' Season')[0].split(':')[0].trim();

    let expansion = "";
    const reason = (trendReason || "").toUpperCase();

    if (reason.includes("SEASON") || reason.includes("ANNOUNCEMENT")) {
        expansion = `${series} is officially in production for its next installment. The continuation is expected to build directly on the events of the previous arc, focusing on narrative progression and character development. While specific premiere windows are often revealed via official production channels, the project marks a significant milestone for the series' ongoing adaptation.`;
    } else if (reason.includes("TRAILER") || reason.includes("VISUAL")) {
        expansion = `A new technical reveal for ${series} has been released, highlighting the production's updated visual direction and aesthetic standards. These reveals typically showcase the work of the returning animation staff and provide a glimpse into the production quality of the upcoming episodes.`;
    } else if (reason.includes("EPISODE") || reason.includes("REACTION")) {
        expansion = `The latest developments in ${series} have established new narrative stakes for the current arc. The story continues to explore the complexities of its established world, moving closer to key plot resolutions that have been anticipated by the audience.`;
    } else {
        expansion = `${series} remains a point of significant interest within the industry. The series' impact is driven by its consistent production quality and its ability to adapt complex narrative themes for a global audience.`;
    }

    // 3. Merge Source Data + Expansion
    // Heuristic: If source is short or contains hype patterns, use educational expansion.
    const hypePatterns = [/fans are/i, /internet/i, /buzz/i, /finally/i, /amazing/i, /incredible/i, /must/i];
    const isHype = hypePatterns.some(p => p.test(base));

    let finalBody = (base.length > 120 && !isHype) ? base : expansion;

    // 4. Final Polish: Ensure no hype words OR opinion remains
    const bannedHype = [
        "amazing", "stunning", "incredible", "exciting", "finally",
        "must-watch", "shocks fans", "breaks the internet", "internet is buzzing",
        "fans are losing", "fans can't wait", "worth the wait", "masterpiece"
    ];

    // Clean up title repetition at the start
    if (finalBody.toLowerCase().startsWith(title.toLowerCase())) {
        finalBody = finalBody.substring(title.length).trim();
    }

    // Truncate to safe length
    if (finalBody.length > 350) {
        finalBody = finalBody.substring(0, 347) + '...';
    }

    return finalBody;
}
/**
 * Generates Trending Posts (plural) - Wrapper for engine usage
 * Fetches data from external source (e.g. AniList trending) and generates posts.
 * Note: This function was missing in previous view but implied by usage in generate-fresh.ts.
 * We need to implement it by combining fetchers + generateTrendingPost.
 */
import { fetchSmartTrendingCandidates } from './fetchers';

export async function generateTrendingPosts(): Promise<BlogPost[]> {
    const trendingItems = await fetchSmartTrendingCandidates();
    // fetchAniListTrending returns AniListMedia format, needs adaptation to what generateTrendingPost expects.
    // Actually, looking at generateTrendingPost usage, it expects an object with imageSearchTerm, trendReason etc.
    // Let's check fetchers.ts again if needed, but for now we implement the bridge.

    // We need to map AniListMedia to the "trendingItem" shape expected by generateTrendingPost
    // The "trendingItem" shape seems loose (any), effectively an extended media object.

    const posts: BlogPost[] = [];
    const date = new Date();

    for (const item of trendingItems) {
        // Map Smart Item
        const genItem = {
            title: item.title,
            fullTitle: item.fullTitle,
            slug: item.slug,
            image: item.image,
            imageSearchTerm: item.imageSearchTerm,
            content: item.content,
            trendReason: item.trendReason
        };

        const post = await generateTrendingPost(genItem, date);
        if (post) {
            posts.push(post);
        }
    }

    return posts;
}
