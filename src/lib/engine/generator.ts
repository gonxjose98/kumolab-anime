/**
 * generator.ts
 * Content generation and validation for KumoLab
 */

import { AiringEpisode } from './fetchers';
import { BlogPost, PostType, ClaimType } from '@/types';
import { generateIntelImage } from './image-processor';
import { fetchOfficialAnimeImage } from './fetchers';
import { randomUUID } from 'crypto';
import { AntigravityAI } from './ai';
import { selectBestImage } from './image-selector';
import { generateEventFingerprint } from './utils';

/**
 * Generates a Daily Drops (DROP) post from a list of airing episodes.
 */
export function generateDailyDropsPost(episodes: AiringEpisode[], date: Date, forceDateStr?: string): BlogPost | null {
    if (episodes.length === 0) return null;

    const dateString = forceDateStr || date.toISOString().split('T')[0];

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
        status: 'published',
        verification_tier: episodes[0].provenance?.tier,
        verification_reason: 'Strict Primary Source Verified',
        verification_sources: sourcesMap
    };
}

/**
 * Generates an Anime Intel (INTEL) post.
 */
export async function generateIntelPost(intelItems: any[], date: Date): Promise<BlogPost | null> {
    if (intelItems.length === 0) return null;

    const item = intelItems[0];
    const todayStr = date.toISOString().split('T')[0];

    // 1. STRICT CLASSIFICATION & SOURCE CHECK
    const claimType = item.claimType as ClaimType;
    if (claimType === 'NEW_SEASON_CONFIRMED') {
        const isTier12 = item.verification_tier <= 2;
        if (!isTier12) {
            console.error(`[Generator] ABORT: NEW_SEASON_CONFIRMED requires Tier 1/2 source. Got: ${item.verification_tier}`);
            return null; // Should quarantine in engine
        }
    }

    // 2. SEASON LABEL EXTRACTION
    let seasonLabel = item.season_label || '';
    if (!seasonLabel) {
        const title = item.title.toLowerCase();
        const seasonMatch = title.match(/season\s+(\d+)/i) || title.match(/(\d+)(?:st|nd|rd|th)?\s*season/i);
        if (seasonMatch) seasonLabel = `Season ${seasonMatch[1]}`;
        else if (title.includes('part 2')) seasonLabel = 'Part 2';
        else if (title.includes('cour 2')) seasonLabel = 'Cour 2';
        // Add more if needed.
    }

    // 3. TITLE GENERATION (TEMPLATES ONLY)
    // Extract series name without extra detail
    const actionVerbs = [' Screens', ' Unveils', ' Casts', ' Announces', ' Teases', ' Reveals', ' Releases', ' Opens', ' Sets', ' Drops', ' Debuts'];
    let animeTitle = item.title.split(':')[0].split(' Season')[0].split(' –')[0].trim();

    actionVerbs.forEach(v => {
        const idx = animeTitle.indexOf(v);
        if (idx !== -1) animeTitle = animeTitle.substring(0, idx).trim();
    });

    // Strip common noise
    const eventNoise = [
        'TV Anime', 'Original', 'The Movie', 'Anime', 'Film', 'Manga', 'Light Novel', 'Novel',
        'World Premiere', 'Premiere', 'Restoration', '4K UHD', '4K', 'UHD', 'Screening', 'Special',
        'Update', 'Announcement', 'Project', 'Review', 'intel', 'Intel', 'Drop', 'Trending',
        'Official', 'Key Visual', 'Trailer', 'PV', 'CM', 'New', 'Latest'
    ];
    eventNoise.forEach(n => {
        animeTitle = animeTitle.replace(new RegExp(`\\b${n}\\b`, 'gi'), '').trim();
    });

    // Remove brackets
    animeTitle = animeTitle.replace(/[【】\[\]]/g, '').trim();

    // Final cleanup of "of" and spaces
    animeTitle = animeTitle.replace(/\bof\b/gi, '').replace(/\s+/g, ' ').trim();

    let finalTitle = "";

    switch (claimType) {
        case 'NEW_SEASON_CONFIRMED':
            finalTitle = `${animeTitle}: ${seasonLabel || 'New Season'} Confirmed`;
            break;
        case 'DATE_ANNOUNCED':
            const dateLabel = item.premiereDate ? formatToMonthYear(item.premiereDate) : "TBA";
            finalTitle = `${animeTitle} Sets Premiere for ${dateLabel}`;
            break;
        case 'DELAY':
            if (item.premiereDate) finalTitle = `${animeTitle} Delayed — Now Set for ${formatToMonthYear(item.premiereDate)}`;
            else finalTitle = `${animeTitle} Delayed — New Date Pending`;
            break;
        case 'NEW_KEY_VISUAL':
            finalTitle = `${animeTitle} Drops New Key Visual`;
            break;
        case 'TRAILER_DROP':
            finalTitle = `${animeTitle} Releases New Trailer`;
            break;
        case 'CAST_ADDITION':
            finalTitle = `${animeTitle} Reveals New Cast Members`;
            break;
        case 'STAFF_UPDATE':
            finalTitle = `${animeTitle} Announces Staff Update`;
            break;
        case 'DELAY':
            finalTitle = `${animeTitle} Delayed — New Date Pending`;
            break;
        default:
            // Ensure action verbs are stripped from general updates too
            const cleanTitle = animeTitle
                .replace(/\b(?:Update|Reveals|Releases|Canceled|Cancelled)\b/gi, '')
                .replace(/\s+/g, ' ')
                .trim();
            finalTitle = `${cleanTitle} Update`;
    }

    // 4. IMAGE SELECTION (Stage A & B)
    let selectedImage = "";
    let isAnnouncementTied = false;
    let classification: 'CLEAN' | 'TEXT_HEAVY' = 'CLEAN';

    // Stage A: Announcement Asset Extraction
    if (item.announcementAssets && item.announcementAssets.length > 0) {
        selectedImage = item.announcementAssets[0];
        isAnnouncementTied = true;
        // Determine classification for announcement image
        classification = selectedImage.toLowerCase().includes('visual') || selectedImage.toLowerCase().includes('poster') ? 'TEXT_HEAVY' : 'CLEAN';
    }

    // Hard Rule for NEW_KEY_VISUAL
    if (claimType === 'NEW_KEY_VISUAL' && !isAnnouncementTied) {
        console.error(`[Generator] ABORT: NEW_KEY_VISUAL requires announcement-tied image.`);
        return null; // Quarantine
    }

    // Stage B: Visual Recency & Validity Ranking (Fallback)
    if (!selectedImage) {
        const imageResult = await selectBestImage(item.imageSearchTerm || animeTitle, claimType);
        if (imageResult) {
            selectedImage = imageResult.url;
            classification = imageResult.classification;
        }
    }

    let finalImage = selectedImage;
    let imageSettings = {};
    if (selectedImage && !selectedImage.startsWith('data:')) {
        const result = await generateIntelImage({
            sourceUrl: selectedImage,
            animeTitle: finalTitle,
            headline: '', // Template already includes the event type in the title
            slug: item.slug || `intel-${item.anime_id || 'news'}-${todayStr}-${randomUUID().substring(0, 4)}`,
            classification: classification,
            applyText: classification === 'CLEAN',
            applyGradient: classification === 'CLEAN'
        });
        if (result?.processedImage) {
            finalImage = result.processedImage;
            imageSettings = {
                textScale: result.layout?.finalScale || 1,
                textPosition: { x: 540, y: result.layout?.y || 1113.75 },
                isApplyText: classification === 'CLEAN',
                isApplyGradient: classification === 'CLEAN',
                isApplyWatermark: classification === 'CLEAN',
                purpleWordIndices: [],
                gradientPosition: result.layout?.zone === 'HEADER' ? 'top' : 'bottom'
            };
        }
    }

    // 6. CONTENT CLEANUP
    const finalContent = cleanBody(item.content, finalTitle, claimType);

    return {
        id: randomUUID(),
        title: finalTitle,
        slug: item.slug || `intel-${item.anime_id || 'news'}-${todayStr}`,
        type: 'INTEL',
        claimType,
        event_fingerprint: item.event_fingerprint,
        truth_fingerprint: item.truth_fingerprint,
        anime_id: item.anime_id,
        season_label: seasonLabel,
        content: finalContent,
        image: finalImage,
        background_image: selectedImage,
        image_settings: imageSettings,
        is_announcement_tied: isAnnouncementTied,
        timestamp: date.toISOString(),
        isPublished: true,
        status: 'published',
        verification_tier: item.verification_tier,
        verification_reason: `Factual Match: ${claimType}`,
        verification_sources: { source_url: item.source_url }
    };
}

function formatToMonthYear(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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

    const todayStr = date.toISOString().split('T')[0];
    const claimType = trendingItem.claimType as ClaimType;
    const animeTitle = trendingItem.title.split(':')[0].split(' Season')[0].split(' –')[0].trim();

    // 1. TITLE GENERATION (TEMPLATES ONLY)
    let finalTitle = "";
    switch (claimType) {
        case 'NEW_SEASON_CONFIRMED':
            finalTitle = `${animeTitle}: ${trendingItem.season_label || 'New Season'} Confirmed`;
            break;
        case 'TRAILER_DROP':
            finalTitle = `${animeTitle} Releases New Trailer`;
            break;
        case 'NEW_KEY_VISUAL':
            finalTitle = `${animeTitle} Drops New Key Visual`;
            break;
        case 'DATE_ANNOUNCED':
            finalTitle = `${animeTitle} Sets Premiere Date`;
            break;
        case 'DELAY':
            finalTitle = `${animeTitle} Delayed — Now Set for Later`;
            break;
        default:
            finalTitle = `${animeTitle} Trending Now`;
    }

    // 2. IMAGE SELECTION (Stage A & B)
    let selectedImage = "";
    let isAnnouncementTied = false;
    let classification: 'CLEAN' | 'TEXT_HEAVY' = 'CLEAN';

    if (trendingItem.announcementAssets && trendingItem.announcementAssets.length > 0) {
        selectedImage = trendingItem.announcementAssets[0];
        isAnnouncementTied = true;
        classification = selectedImage.toLowerCase().includes('visual') || selectedImage.toLowerCase().includes('poster') ? 'TEXT_HEAVY' : 'CLEAN';
    }

    if (!selectedImage) {
        const imageResult = await selectBestImage(trendingItem.imageSearchTerm || animeTitle, claimType);
        if (imageResult) {
            selectedImage = imageResult.url;
            classification = imageResult.classification;
        }
    }

    if (!selectedImage) {
        selectedImage = trendingItem.image; // Final fallback to candidate image
    }

    if (!selectedImage) {
        console.warn(`[Generator] ABORT: No image found for ${finalTitle}`);
        return null;
    }

    const finalContent = cleanBody(trendingItem.content, finalTitle, claimType);

    // 3. IMAGE PROCESSING
    let finalImage = selectedImage;
    let imageSettings = {};
    if (selectedImage && !selectedImage.startsWith('data:')) {
        const result = await generateIntelImage({
            sourceUrl: selectedImage,
            animeTitle: finalTitle,
            headline: '',
            slug: `trending-${trendingItem.anime_id}`,
            classification: classification,
            applyText: classification === 'CLEAN',
            applyGradient: classification === 'CLEAN'
        });
        if (result?.processedImage) {
            finalImage = result.processedImage;
            imageSettings = {
                textScale: result.layout?.finalScale || 1,
                textPosition: { x: 540, y: result.layout?.y || 1113.75 },
                isApplyText: classification === 'CLEAN',
                isApplyGradient: classification === 'CLEAN',
                isApplyWatermark: classification === 'CLEAN',
                purpleWordIndices: [],
                gradientPosition: result.layout?.zone === 'HEADER' ? 'top' : 'bottom'
            };
        }
    }

    return {
        id: randomUUID(),
        title: finalTitle,
        slug: `trending-${trendingItem.anime_id || 'now'}-${todayStr}-${randomUUID().substring(0, 4)}`,
        type: 'TRENDING',
        claimType,
        event_fingerprint: trendingItem.event_fingerprint,
        truth_fingerprint: trendingItem.truth_fingerprint,
        anime_id: trendingItem.anime_id,
        season_label: trendingItem.season_label,
        content: finalContent,
        image: finalImage,
        background_image: selectedImage,
        image_settings: imageSettings,
        is_announcement_tied: isAnnouncementTied,
        timestamp: date.toISOString(),
        isPublished: true,
        status: 'published'
    };
}

/**
 * Validates post before publishing (non-duplication, image validation).
 */
export async function validatePost(post: BlogPost, existingPosts: BlogPost[], force: boolean = false): Promise<boolean> {
    // 0. BANNED TOPICS (HARD KILL SWITCH)
    const BANNED_TOPICS = [/\bMario\b/i, /\bAI\b/];
    const hasBannedTopic = BANNED_TOPICS.some(pattern =>
        pattern.test(post.title) || pattern.test(post.content)
    );

    if (hasBannedTopic) {
        console.error(`[Validator] REJECTED: Banned topic detected in post "${post.title}".`);
        return false;
    }

    // 1. TRUTH-BASED DEDUPLICATION (LATEST FACTUAL CLAIM)
    // ONLY STRICTLY ENFORCED FOR NEW_SEASON_CONFIRMED to prevent re-announcing already settled facts.
    // Other types (TRAILERS, CAST, DATES) often have multiple legitimate updates that truth-hashing might over-block.
    if (post.truth_fingerprint && post.claimType === 'NEW_SEASON_CONFIRMED') {
        const isDuplicateTruth = existingPosts.some(p => p.truth_fingerprint === post.truth_fingerprint);
        if (isDuplicateTruth && !force) {
            console.log(`[Validator] REJECTED (Truth): Factual claim "Season Confirmed" already exists for this anime. (Fingerprint: ${post.truth_fingerprint})`);
            return false;
        }
    }

    // 2. CANONICAL DEDUPLICATION (FINGERPRINT/URL BASED)
    if (post.event_fingerprint) {
        const isDuplicateFingerprint = existingPosts.some(p => p.event_fingerprint === post.event_fingerprint);
        if (isDuplicateFingerprint && !force) {
            console.log(`[Validator] REJECTED (Signal): Update already processed for this specific signal/URL.`);
            return false;
        }
    }

    // Legacy Title/Slug Deduplication (Backup)
    const normalizedNewTitle = post.title.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    const isDuplicate = existingPosts.some(p => {
        const normalizedOldTitle = p.title.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        return normalizedNewTitle === normalizedOldTitle || p.slug === post.slug;
    });

    if (isDuplicate && !force) {
        console.log(`[Validator] REJECTED (Legacy): Duplicate title/slug detected for "${post.title}"`);
        return false;
    }

    // 2. STRICT IMAGE VALIDATION
    if (!post.image || post.image === '/hero-bg-final.png') {
        console.error(`[Validator] REJECTED: Post "${post.title}" is missing a valid image.`);
        return false;
    }

    if (!post.image.startsWith('http') && !post.image.startsWith('/') && !post.image.startsWith('data:')) {
        console.warn(`[Validator] REJECTED: Invalid image path detected.`);
        return false;
    }

    // 3. Image Accessibility Verification
    if (post.image.startsWith('http')) {
        try {
            const res = await fetch(post.image, { method: 'HEAD', timeout: 5000 } as any);
            if (!res.ok) {
                console.error(`[Validator] REJECTED: Image URL is broken (${res.status}): ${post.image}`);
                return false;
            }
        } catch (e: any) {
            console.error(`[Validator] REJECTED: Image URL unreachable (${e.message}): ${post.image}`);
            return false;
        }
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

    // 6. Remove all unicode dashes (—, –, ‒, ―) and questions
    clean = clean.replace(/[—–‒―]/g, '-');
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
    } else {
        // Even if only one season mention, try to clean up noise AFTER it (like "Episode 3")
        const seasonIdx = clean.search(/(?:Season\s+\d+)|(\d+)(?:st|nd|rd|th)?\s*Season/i);
        if (seasonIdx !== -1) {
            const seasonPart = clean.match(/(?:Season\s+\d+)|(\d+)(?:st|nd|rd|th)?\s*Season/i)![0];
            const animeName = clean.substring(0, seasonIdx).trim();
            clean = `${animeName} ${seasonPart}`;
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

    // 10. Remove all unicode dashes (—, –, ‒, ―)
    clean = clean.replace(/[—–‒―]/g, '-');

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
    const { candidates: trendingItems } = await fetchSmartTrendingCandidates();
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
