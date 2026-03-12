/**
 * expanded-rss.ts
 * Aggregates RSS feeds from multiple anime news sources
 * All sources are free - no API keys required
 */

import { supabaseAdmin } from '../supabase/admin';
import { getRSSSources } from './dynamic-sources';

interface RSSSource {
    name: string;
    url: string;
    tier: number;
    type: 'NEWS' | 'BLOG' | 'OFFICIAL';
    language: 'EN' | 'JP';
    keywordFiltered?: boolean;
}

// Expanded RSS sources — verified working feeds
// Revised 2026-03-12: Restructured tiers for quality
const RSS_SOURCES: RSSSource[] = [
    // T1: Reliable EN aggregation — auto-publish worthy
    { name: 'MyAnimeList News', url: 'https://myanimelist.net/rss/news.xml', tier: 1, type: 'NEWS', language: 'EN' },

    // T2: Good content, needs keyword filtering or review
    { name: 'Anime News Network', url: 'https://www.animenewsnetwork.com/all/rss.xml', tier: 2, type: 'NEWS', language: 'EN', keywordFiltered: true },
    { name: 'Natalie.mu Anime', url: 'https://natalie.mu/comic/feed/news', tier: 2, type: 'NEWS', language: 'JP' },
    { name: 'Oricon Anime', url: 'https://www.oricon.co.jp/rss/news_anime.xml', tier: 2, type: 'NEWS', language: 'JP' },

    // T3: Supplementary sources — manual review
    { name: 'OtakuNews', url: 'https://www.otakunews.com/rss/rss.xml', tier: 3, type: 'BLOG', language: 'EN' },
    { name: 'Anime UK News', url: 'https://animeuknews.net/feed/', tier: 3, type: 'BLOG', language: 'EN' },
    { name: 'MANTAN Web Anime', url: 'https://mantan-web.jp/rss/anime.xml', tier: 3, type: 'NEWS', language: 'JP' },
];

interface RSSItem {
    title: string;
    link: string;
    pubDate: string;
    description: string;
    content?: string;
    imageUrl?: string;
}

interface NewsCandidate {
    title: string;
    link: string;
    publishedAt: string;
    description: string;
    sourceName: string;
    sourceTier: number;
    sourceType: string;
    language: string;
    contentSnippet: string;
    imageUrl?: string;
}

/**
 * Strip CDATA wrapper if present
 */
function stripCDATA(text: string): string {
    return text.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
}

/**
 * Extract image URL from HTML content
 */
function extractImageFromHTML(html: string): string | null {
    if (!html) return null;
    // Look for <img> tags
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch && imgMatch[1]) {
        const url = imgMatch[1];
        // Skip tracking pixels, icons, and tiny images
        if (url.includes('tracking') || url.includes('pixel') || url.includes('1x1')) return null;
        return url;
    }
    // Look for <enclosure> or media:content URLs
    const mediaMatch = html.match(/url=["']([^"']+\.(?:jpg|jpeg|png|webp|gif)[^"']*)["']/i);
    if (mediaMatch) return mediaMatch[1];
    return null;
}

/**
 * Decode HTML entities and strip tags for clean text
 */
function decodeHtmlEntities(text: string): string {
    if (!text) return '';
    // First strip CDATA
    let cleaned = stripCDATA(text);
    // Decode common HTML entities
    cleaned = cleaned
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)))
        .replace(/&nbsp;/g, ' ');
    // Strip all HTML tags
    cleaned = cleaned.replace(/<[^>]+>/g, ' ');
    // Collapse whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
}

/**
 * Fetch and parse RSS feed with proper CDATA handling
 */
async function fetchRSSFeed(url: string): Promise<RSSItem[]> {
    try {
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/rss+xml, text/xml, application/xml',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            signal: AbortSignal.timeout(10000)
        });

        if (!response.ok) {
            console.error(`[RSS] Failed to fetch ${url}: ${response.status}`);
            return [];
        }

        const xmlText = await response.text();

        // Parse RSS items
        const items = xmlText.match(/<item>[\s\S]*?<\/item>/g) || [];

        return items.map(item => {
            // Use [\s\S]*? for multiline content (handles CDATA)
            const titleMatch = item.match(/<title[^>]*>([\s\S]*?)<\/title>/);
            const linkMatch = item.match(/<link[^>]*>([\s\S]*?)<\/link>/);
            const pubDateMatch = item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/);
            const descMatch = item.match(/<description[^>]*>([\s\S]*?)<\/description>/);
            const contentMatch = item.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/);

            // Extract image from multiple possible locations
            const enclosureMatch = item.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i);
            const mediaMatch = item.match(/<media:content[^>]+url=["']([^"']+)["']/i);
            const mediaThumbnail = item.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);

            const rawTitle = titleMatch ? titleMatch[1] : '';
            const rawDesc = descMatch ? descMatch[1] : '';
            const rawContent = contentMatch ? contentMatch[1] : '';

            // Try to find an image in order of priority
            let imageUrl = enclosureMatch?.[1]
                || mediaMatch?.[1]
                || mediaThumbnail?.[1]
                || extractImageFromHTML(stripCDATA(rawContent))
                || extractImageFromHTML(stripCDATA(rawDesc))
                || null;

            return {
                title: decodeHtmlEntities(rawTitle),
                link: linkMatch ? linkMatch[1].trim() : '',
                pubDate: pubDateMatch ? pubDateMatch[1].trim() : '',
                description: decodeHtmlEntities(rawDesc),
                content: decodeHtmlEntities(rawContent),
                imageUrl: imageUrl || undefined,
            };
        });

    } catch (error) {
        console.error(`[RSS] Error fetching ${url}:`, error);
        return [];
    }
}

/**
 * Check if article is anime-related
 */
function isAnimeRelated(title: string, description: string): boolean {
    const text = (title + ' ' + description).toLowerCase();

    const animeKeywords = [
        'anime', 'manga', 'season', 'episode', 'trailer', 'pv',
        'studio', 'voice actor', 'seiyuu', 'adaptation',
        'crunchyroll', 'funimation', 'netflix', 'hidive',
        'mappa', 'kyoto animation', 'ufotable', 'wit studio',
        'production', 'animation', 'broadcast', 'airing',
        'shonen', 'shojo', 'isekai', 'light novel', 'visual novel',
        'simulcast', 'dub', 'sub', 'key visual', 'premiere'
    ];

    return animeKeywords.some(kw => text.includes(kw));
}

/**
 * Detect claim type from article
 */
function detectClaimType(title: string): string {
    const lower = title.toLowerCase();

    if (lower.includes('trailer') || lower.includes('pv')) return 'TRAILER_DROP';
    if (lower.includes('cast') && lower.includes('reveal')) return 'CAST_ADDITION';
    if (lower.includes('release date') || lower.includes('premiere')) return 'DATE_ANNOUNCED';
    if (lower.includes('season') && lower.includes('confirm')) return 'NEW_SEASON_CONFIRMED';
    if (lower.includes('key visual') || lower.includes('visual')) return 'NEW_KEY_VISUAL';
    if (lower.includes('staff')) return 'STAFF_UPDATE';
    if (lower.includes('delay') || lower.includes('postpone')) return 'DELAY';

    return 'OTHER';
}

/**
 * Generate a stable slug from title (not URL)
 */
function generateSlug(title: string, source: string): string {
    const base = title
        .toLowerCase()
        .replace(/['']/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 60);

    // Add source prefix for uniqueness
    const srcPrefix = source.substring(0, 3).toLowerCase().replace(/[^a-z]/g, '');
    return `${srcPrefix}-${base}`;
}

/**
 * Normalize text for fuzzy matching
 */
function normalizeForMatching(text: string): string {
    return text
        .toLowerCase()
        .replace(/season\s*\d+/gi, '')
        .replace(/[^\w]/g, '')
        .trim();
}

/**
 * Check if article has already been processed (by URL, slug, OR fuzzy title match)
 */
async function isArticleProcessed(link: string, title: string, slug: string): Promise<{ isDuplicate: boolean; reason: string }> {
    // 1. Check exact URL match
    const { data: urlMatch } = await supabaseAdmin
        .from('posts')
        .select('id, title')
        .eq('source_url', link)
        .limit(1);

    if (urlMatch && urlMatch.length > 0) {
        return { isDuplicate: true, reason: `URL already exists: "${urlMatch[0].title}"` };
    }

    // 2. Check slug collision
    const { data: slugMatch } = await supabaseAdmin
        .from('posts')
        .select('id, title')
        .eq('slug', slug)
        .limit(1);

    if (slugMatch && slugMatch.length > 0) {
        return { isDuplicate: true, reason: `Slug collision: "${slugMatch[0].title}"` };
    }

    // 3. Check fuzzy title match (same story from different sources)
    const normalizedTitle = normalizeForMatching(title);
    if (normalizedTitle.length < 10) {
        return { isDuplicate: false, reason: '' };
    }

    // Look for similar titles in last 72 hours
    const cutoffTime = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const { data: titleMatches } = await supabaseAdmin
        .from('posts')
        .select('id, title, source')
        .gt('timestamp', cutoffTime)
        .limit(100);

    if (titleMatches) {
        for (const post of titleMatches) {
            const normalizedExisting = normalizeForMatching(post.title);
            const longer = Math.max(normalizedTitle.length, normalizedExisting.length);
            const shorter = Math.min(normalizedTitle.length, normalizedExisting.length);

            if (shorter / longer > 0.7) {
                // Check if titles share significant words
                const words1 = normalizedTitle.match(/\w{4,}/g) || ([] as string[]);
                const words2 = normalizedExisting.match(/\w{4,}/g) || ([] as string[]);
                const overlap = words1.filter(w => words2.includes(w)).length;
                const maxWords = Math.max(words1.length, words2.length);

                if (maxWords > 0 && overlap / maxWords > 0.6) {
                    return { isDuplicate: true, reason: `Similar to: "${post.title}" from ${post.source}` };
                }
            }
        }
    }

    // 4. Check declined posts to avoid re-scraping
    try {
        const { data: declined } = await supabaseAdmin
            .from('declined_posts')
            .select('title')
            .limit(50);

        if (declined) {
            for (const d of declined) {
                const normalizedDeclined = normalizeForMatching(d.title);
                if (normalizedDeclined.length > 10 && normalizedTitle.includes(normalizedDeclined.substring(0, 20))) {
                    return { isDuplicate: true, reason: 'Previously declined' };
                }
            }
        }
    } catch {
        // declined_posts table may not exist yet
    }

    return { isDuplicate: false, reason: '' };
}

/**
 * Main function to scan all RSS sources
 */
export async function scanRSSFeeds(
    hoursBack: number = 6
): Promise<NewsCandidate[]> {
    console.log(`[RSS] Scanning feeds for articles from last ${hoursBack} hours...`);

    // Try dynamic sources first, fall back to hardcoded defaults
    const dynamicRSS = await getRSSSources();
    const sources: RSSSource[] = dynamicRSS
        ? dynamicRSS.map(s => ({
            name: s.name,
            url: s.url || '',
            tier: s.tier || 2,
            type: 'NEWS' as const,
            language: (s.lang === 'JP' ? 'JP' : 'EN') as 'EN' | 'JP',
        }))
        : RSS_SOURCES;

    const candidates: NewsCandidate[] = [];
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const seenTitles = new Set<string>(); // In-batch dedup
    let stats = { total: 0, tooOld: 0, duplicate: 0, notAnime: 0, accepted: 0, inBatchDup: 0 };

    for (const source of sources) {
        console.log(`[RSS] Checking ${source.name}...`);

        const items = await fetchRSSFeed(source.url);
        console.log(`[RSS] ${source.name}: ${items.length} raw items`);

        for (const item of items) {
            stats.total++;

            // Skip items with no title
            if (!item.title || item.title.length < 5) continue;

            const publishedAt = new Date(item.pubDate);

            // Skip old articles
            if (publishedAt < cutoffTime) {
                stats.tooOld++;
                continue;
            }

            // In-batch dedup by normalized title
            const normalizedTitle = normalizeForMatching(item.title);
            if (seenTitles.has(normalizedTitle)) {
                stats.inBatchDup++;
                continue;
            }
            seenTitles.add(normalizedTitle);

            // Generate slug early for duplicate checking
            const slug = generateSlug(item.title, source.name);

            // Check if already processed (URL + slug + fuzzy title)
            const dupCheck = await isArticleProcessed(item.link, item.title, slug);
            if (dupCheck.isDuplicate) {
                stats.duplicate++;
                console.log(`[RSS SKIP] ${source.name}: "${item.title.substring(0, 50)}..." — ${dupCheck.reason}`);
                continue;
            }

            // Check if anime-related
            if (!isAnimeRelated(item.title, item.description)) {
                stats.notAnime++;
                continue;
            }

            stats.accepted++;
            candidates.push({
                title: item.title,
                link: item.link,
                publishedAt: item.pubDate,
                description: item.description,
                sourceName: source.name,
                sourceTier: source.tier,
                sourceType: source.type,
                language: source.language,
                contentSnippet: item.content || item.description,
                imageUrl: item.imageUrl,
            });

            console.log(`[RSS] ACCEPTED: ${item.title.substring(0, 60)}...${item.imageUrl ? ' [HAS IMAGE]' : ' [NO IMAGE]'}`);
        }

        // Small delay between sources
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`[RSS] SCAN COMPLETE:`);
    console.log(`  Total checked: ${stats.total}`);
    console.log(`  Too old: ${stats.tooOld}`);
    console.log(`  Duplicate: ${stats.duplicate}`);
    console.log(`  In-batch dup: ${stats.inBatchDup}`);
    console.log(`  Not anime: ${stats.notAnime}`);
    console.log(`  ACCEPTED: ${stats.accepted}`);

    return candidates;
}

/**
 * Generate a post from RSS article
 */
export function generateRSSPost(candidate: NewsCandidate, now: Date): any {
    const claimType = detectClaimType(candidate.title);
    const slug = generateSlug(candidate.title, candidate.sourceName);

    // Determine post type
    let postType: 'INTEL' | 'TRENDING' | 'TRAILER' = 'INTEL';
    if (claimType === 'TRAILER_DROP') postType = 'TRAILER';
    else if (candidate.sourceType === 'BLOG') postType = 'TRENDING';

    // Clean description — remove any leftover HTML entities or tags
    let cleanDesc = candidate.description;
    if (cleanDesc.length > 500) {
        cleanDesc = cleanDesc.substring(0, 500) + '...';
    }

    return {
        id: crypto.randomUUID(),
        title: candidate.title,
        slug,
        content: `${cleanDesc}\n\nSource: ${candidate.sourceName}\nRead more: ${candidate.link}`,
        image: candidate.imageUrl || null,
        type: postType,
        claim_type: claimType,
        status: 'pending',
        is_published: false,
        headline: claimType.replace(/_/g, ' '),
        source_url: candidate.link,
        source: candidate.sourceName,
        source_tier: candidate.sourceTier,
        verification_badge: candidate.sourceName,
        verification_score: candidate.sourceTier === 1 ? 85 : 75,
        language: candidate.language,
        timestamp: now.toISOString(),
    };
}

export { RSS_SOURCES };
export type { NewsCandidate, RSSItem, RSSSource };
