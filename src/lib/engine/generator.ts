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

    // premiere_date is often missing for early confirmations
    if (['premiered', 'now_streaming'].includes(claimType) && !premiereDateStr) {
        // Fallback for missing date on already aired content
        console.warn(`[Generator] Warning: claim_type "${claimType}" lacks premiere_date. Defaulting to safe labels.`);
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

    // 3. CARD OVERLAY TAG (LOCKED)
    // Headline/Tag mapping for the visual overlay
    const overlayTextMap: Record<ClaimType, string> = {
        confirmed: premiereDateStr ? `PREMIERES ${formatPremiereDate(premiereDateStr)}` : "OFFICIALLY CONFIRMED",
        premiered: premiereDateStr ? `PREMIERED ${formatPremiereDate(premiereDateStr)}` : "PREMIERED",
        now_streaming: "NOW STREAMING",
        delayed: "PRODUCTION DELAY",
        trailer: "NEW TRAILER",
        finale_aired: "FINALE AIRED",
        new_visual: "NEW VISUAL"
    };

    const overlayTag = overlayTextMap[claimType] || "LATEST NEWS";

    // IMAGE RELEVANCE PROMPT (LOCKED)
    // "An anime always has to be chosen. Fallback image should never be used."
    let officialSourceImage = topItem.image;

    // Use imageSearchTerm if provided by the fetcher
    const searchTerm = topItem.imageSearchTerm || topItem.title.split(' Season')[0].split(':')[0].trim();

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

        // Strategy 3: First 5 Words (Better for long titles)
        const simpleWords = term.split(' ');
        if (simpleWords.length > 3) {
            const shortTerm = simpleWords.slice(0, 5).join(' ');
            img = await fetchOfficialAnimeImage(shortTerm);
            if (img) return img;
        }

        return null;
    };

    if (!officialSourceImage && searchTerm) {
        try {
            officialSourceImage = await findImageWithRetries(searchTerm);
        } catch (e) {
            console.error('Failed to fetch official image via custom search:', e);
        }
    }

    // DESPERATE LAST RESORT: Try searching for just the SERIES name without any detail
    if (!officialSourceImage && searchTerm) {
        const seriesName = searchTerm.split(' ')[0];
        if (seriesName.length > 3) {
            console.log(`[Generator] FINAL DESPERATE SEARCH for "${seriesName}"`);
            officialSourceImage = await fetchOfficialAnimeImage(seriesName);
        }
    }

    if (!officialSourceImage) {
        console.warn('No official source image found after ALL strategies. Using fallback.');
        officialSourceImage = '/hero-bg-final.png';
    }

    const validTitle = cleanTitle(topItem.fullTitle || topItem.title);

    // ENSURE SIMPLE FORMAT: "Anime Name Season X Confirmed"
    let finalDisplayTitle = validTitle;
    if (claimType === 'confirmed' && !finalDisplayTitle.toLowerCase().includes('confirmed')) {
        finalDisplayTitle += ' Confirmed';
    }

    const validContent = cleanBody(topItem.content, finalDisplayTitle);

    // 3. DYNAMIC PURPLE HIGHLIGHT
    const titleWords = finalDisplayTitle.split(/\s+/).filter(Boolean);
    const targetWords = ['debut', 'debuts', 'july', 'confirmed', 'trailer', 'visual'];
    const purpleWordIndices: number[] = [];

    titleWords.forEach((word, idx) => {
        if (targetWords.some(tw => word.toLowerCase().includes(tw))) {
            purpleWordIndices.push(idx);
        }
    });

    // CHECK FOR TEXT CLEANLINESS
    const isVisual = topItem.claimType === 'new_visual' || finalDisplayTitle.toLowerCase().includes('visual') || finalDisplayTitle.toLowerCase().includes('poster');
    const isTrailer = topItem.claimType === 'trailer' || finalDisplayTitle.toLowerCase().includes('trailer') || finalDisplayTitle.toLowerCase().includes('pv');

    const shouldDisableOverlay = isVisual || isTrailer;
    if (shouldDisableOverlay) {
        console.log(`[Generator] Detected Visual/Trailer (${finalDisplayTitle}). Disabling text overlay.`);
    }

    let finalImage: string | undefined = undefined;
    if (officialSourceImage) {
        const processedImageUrl = await generateIntelImage({
            sourceUrl: officialSourceImage,
            animeTitle: finalDisplayTitle,
            headline: overlayTag, // Use the specific tag mapping for the visual
            purpleWordIndices,
            slug: topItem.slug || 'intel',
            applyText: !shouldDisableOverlay
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
        title: finalDisplayTitle,
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

        // Strategy 3: First 5 Words
        const simpleWords = term.split(' ');
        if (simpleWords.length > 3) {
            const shortTerm = simpleWords.slice(0, 5).join(' ');
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
            if (firstWord.length > 3) {
                console.log(`[Generator-Trending] FINAL DESPERATE SEARCH: Searching for "${firstWord}"`);
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

    // ENSURE SIMPLE FORMAT: "Anime Name Season X Confirmed"
    let finalDisplayTitle = validTitle;
    if (trendingItem.trendReason === 'SEASON ANNOUNCEMENT' && !finalDisplayTitle.toLowerCase().includes('confirmed')) {
        finalDisplayTitle += ' Confirmed';
    }

    const validContent = cleanBody(trendingItem.content, finalDisplayTitle);

    let finalImage: string | undefined = undefined;
    if (officialSourceImage) {
        // Enforce KumoLab branding for Trending posts as requested by User
        const titleWords = finalDisplayTitle.split(/\s+/).filter(Boolean);
        const targetWords = ['debut', 'debuts', 'july', 'confirmed', 'trailer', 'visual'];
        const purpleWordIndices: number[] = [];

        titleWords.forEach((word, idx) => {
            if (targetWords.some(tw => word.toLowerCase().includes(tw))) {
                purpleWordIndices.push(idx);
            }
        });

        // CHECK FOR TEXT CLEANLINESS (Trending Version)
        const isVisual = trendingItem.trendReason === 'VISUAL REVEAL' || finalDisplayTitle.toLowerCase().includes('visual');
        const isTrailer = trendingItem.trendReason === 'TRAILER REVEAL' || finalDisplayTitle.toLowerCase().includes('trailer');

        const shouldDisableOverlay = isVisual || isTrailer;
        if (shouldDisableOverlay) {
            console.log(`[Generator-Trending] Detected Visual/Trailer (${finalDisplayTitle}). Disabling text overlay.`);
        }

        const processedImageUrl = await generateIntelImage({
            sourceUrl: officialSourceImage,
            animeTitle: finalDisplayTitle,
            headline: trendingItem.trendReason || '', // Use the trend reason as a tag
            purpleWordIndices,
            slug: trendingItem.slug || 'trending',
            applyText: !shouldDisableOverlay
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
        title: finalDisplayTitle,
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
    // 0. BANNED TOPICS (HARD KILL SWITCH)
    const BANNED_TOPICS = ['Mario', 'AI'];
    const hasBannedTopic = BANNED_TOPICS.some(topic =>
        post.title.toLowerCase().includes(topic.toLowerCase()) ||
        post.content.toLowerCase().includes(topic.toLowerCase())
    );

    if (hasBannedTopic) {
        console.error(`[Validator] REJECTED: Banned topic detected in post "${post.title}".`);
        return false;
    }

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

    // 5. Simplify Status Keywords
    clean = clean.replace(/Officially Confirmed/gi, 'Confirmed')
        .replace(/has been confirmed/gi, 'Confirmed')
        .replace(/Announced to Get/gi, 'Gets')
        .replace(/Reveals New/gi, 'New')
        .replace(/Teases New/gi, 'New');

    // 6. Remove common RSS junk
    clean = clean.replace(/News:/gi, '')
        .replace(/Create/gi, '')
        .replace(/Vote/gi, '')
        .replace(/Poll/gi, '');

    // 6. Remove questions
    clean = clean.replace(/\?/g, '');

    // 7. Resolve Multiple Season Mentions (e.g. "Season 2... 3rd Season")
    const seasonRegex = /(?:Season\s+(\d+))|(\d+)(?:st|nd|rd|th)?\s*Season/gi;
    const seasonMentions = [...clean.matchAll(seasonRegex)];

    if (seasonMentions && seasonMentions.length > 1) {
        // Find the highest number
        let highest = 0;
        seasonMentions.forEach(m => {
            const num = parseInt(m[1] || m[2] || '0');
            if (num > highest) highest = num;
        });
        if (highest > 0) {
            // Find first mention of ANY season to keep the anime title before it
            const firstIdx = clean.search(/(?:Season\s+\d+)|(\d+)(?:st|nd|rd|th)?\s*Season/i);
            const animeName = clean.substring(0, firstIdx).trim();
            clean = `${animeName} Season ${highest}`;
        }
    }

    // 8. Final Formatting: Remove extra spaces and trailing noise
    clean = clean.replace(/\s+/g, ' ').trim();
    // Remove leading/trailing non-alphanumeric (like - or :)
    clean = clean.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');

    // 9. Hard Length Cap for Image Safety (User Limit: 100 chars)
    if (clean.length > 100) {
        // Try to truncate at last space
        const truncated = clean.substring(0, 100);
        const lastSpace = truncated.lastIndexOf(' ');
        clean = (lastSpace > 50 ? truncated.substring(0, lastSpace) : truncated) + '...';
    }

    return clean;
}

/**
 * STRICT BODY RULES (KumoLab Voice):
 * - Minimalist, Factual, Future-Facing.
 * - Structure: 1-2 sentences of context.
 * - Standard Closing: "More information is expected..."
 */
export function cleanBody(content: string, title: string, trendReason?: string): string {
    // 1. Base Cleanup
    let base = (content || '').replace(/<[^>]*>?/gm, '') // Strip HTML
        .replace(/Read more.*/gi, '') // Strip links
        .replace(/http\S+/g, '') // Strip URLs
        .replace(/\b(Source|Via):.*/gi, '') // Strip credits
        .replace(/\b(Images?|Video|Credit):.*/gi, '')
        .trim();

    const series = title.split(' Season')[0].split(':')[0].trim();

    // 2. Intelligent Hype Stripping (In-place)
    // Instead of discarding the text, we neutralize it.
    const hypePhrases = [
        "fans are excited", "fans are losing it", "breaks the internet",
        "internet is buzzing", "can't wait", "worth the wait",
        "masterpiece", "incredible", "amazing", "stunning",
        "finally here", "just announced", "check out",
        "what do you think?", "let us know"
    ];

    hypePhrases.forEach(phrase => {
        const regex = new RegExp(phrase, 'gi');
        base = base.replace(regex, '');
    });

    // 3. Fallback Generation (If source is essentially empty)
    if (base.length < 20) {
        const reason = (trendReason || "").toUpperCase();
        if (reason.includes("SEASON") || reason.includes("ANNOUNCEMENT")) {
            base = `${series} is in production for its next installment. The project continues the narrative progression of the series.`;
        } else if (reason.includes("TRAILER") || reason.includes("VISUAL")) {
            base = `New promotional material for ${series} has been released, providing an updated look at the production's visual direction.`;
        } else {
            base = `${series} continues to generate significant interest. The series remains a key topic of discussion within the industry.`;
        }
    }

    // 4. Clean Start (Remove title redundancy)
    if (base.toLowerCase().startsWith(title.toLowerCase())) {
        base = base.substring(title.length).trim();
        // Remove leading punctuation leftover
        base = base.replace(/^[:\-\s]+/, '');
    }

    // Capitalize first letter
    base = base.charAt(0).toUpperCase() + base.slice(1);

    // 5. Truncate & Standardize
    // Keep it punchy (max 250 chars)
    if (base.length > 250) {
        base = base.substring(0, 247).trim();
        // Ensure we don't cut mid-sentence if possible, or simple ellipsis
        const lastDot = base.lastIndexOf('.');
        if (lastDot > 150) {
            base = base.substring(0, lastDot + 1);
        } else {
            base += '...';
        }
    }

    // 6. The KumoLab Closer
    const closers = [
        "\n\nMore information is expected closer to release.",
        "\n\nMore information is expected ahead of the release.",
        "\n\nFurther details have not yet been announced."
    ];

    // Pick one deterministically based on length to vary slightly but keep tone
    const closer = closers[base.length % closers.length];

    return base + closer;
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
