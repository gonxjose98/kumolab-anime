/**
 * expanded-rss.ts
 * Aggregates RSS feeds from multiple anime news sources
 * All sources are free - no API keys required
 */

import { supabaseAdmin } from '../supabase/admin';

interface RSSSource {
    name: string;
    url: string;
    tier: number;
    type: 'NEWS' | 'BLOG' | 'OFFICIAL';
    language: 'EN' | 'JP';
}

// Expanded RSS sources
const RSS_SOURCES: RSSSource[] = [
    // English sources
    { name: 'MyAnimeList News', url: 'https://myanimelist.net/rss/news.xml', tier: 1, type: 'NEWS', language: 'EN' },
    { name: 'Crunchyroll News', url: 'https://cr-news-api-service.prd.crunchyrollsvc.com/v1/en-US/rss', tier: 1, type: 'OFFICIAL', language: 'EN' },
    { name: 'Anime News Network', url: 'https://www.animenewsnetwork.com/all/rss.xml', tier: 1, type: 'NEWS', language: 'EN' },
    
    // Japanese sources (primary sources - earlier news)
    { name: 'Natalie.mu Anime', url: 'https://natalie.mu/comic/feed/news', tier: 1, type: 'NEWS', language: 'JP' },
    { name: 'Oricon Anime', url: 'https://www.oricon.co.jp/rss/news_anime.xml', tier: 1, type: 'NEWS', language: 'JP' },
    { name: 'MANTAN Web', url: 'https://mantan-web.jp/rss.xml', tier: 2, type: 'NEWS', language: 'JP' },
    
    // Additional English sources
    { name: 'Anime UK News', url: 'https://animeuknews.net/feed/', tier: 2, type: 'BLOG', language: 'EN' },
    { name: 'Anime Herald', url: 'https://www.animeherald.com/feed/', tier: 2, type: 'NEWS', language: 'EN' },
];

interface RSSItem {
    title: string;
    link: string;
    pubDate: string;
    description: string;
    content?: string;
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
}

/**
 * Fetch and parse RSS feed
 */
async function fetchRSSFeed(url: string): Promise<RSSItem[]> {
    try {
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/rss+xml, text/xml, application/xml',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            // Timeout after 10 seconds
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
            const titleMatch = item.match(/<title>(.*?)<\/title>/);
            const linkMatch = item.match(/<link>(.*?)<\/link>/);
            const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
            const descMatch = item.match(/<description>(.*?)<\/description>/);
            const contentMatch = item.match(/<content:encoded>(.*?)<\/content:encoded>/);
            
            return {
                title: titleMatch ? decodeHtmlEntities(titleMatch[1]) : '',
                link: linkMatch ? linkMatch[1] : '',
                pubDate: pubDateMatch ? pubDateMatch[1] : '',
                description: descMatch ? decodeHtmlEntities(descMatch[1]) : '',
                content: contentMatch ? decodeHtmlEntities(contentMatch[1]) : '',
            };
        });
        
    } catch (error) {
        console.error(`[RSS] Error fetching ${url}:`, error);
        return [];
    }
}

/**
 * Decode HTML entities
 */
function decodeHtmlEntities(text: string): string {
    if (!text) return '';
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/<[^>]+>/g, ' ') // Strip HTML tags
        .replace(/\s+/g, ' ')
        .trim();
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
        'production', 'animation', 'broadcast', 'airing'
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
 * Check if article has already been processed
 */
async function isArticleProcessed(link: string): Promise<boolean> {
    const { data } = await supabaseAdmin
        .from('posts')
        .select('id')
        .eq('source_url', link)
        .limit(1);
    
    return !!(data && data.length > 0);
}

/**
 * Main function to scan all RSS sources
 */
export async function scanRSSFeeds(
    hoursBack: number = 6
): Promise<NewsCandidate[]> {
    console.log(`[RSS] Scanning feeds for articles from last ${hoursBack} hours...`);
    
    const candidates: NewsCandidate[] = [];
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    
    for (const source of RSS_SOURCES) {
        console.log(`[RSS] Checking ${source.name}...`);
        
        const items = await fetchRSSFeed(source.url);
        
        for (const item of items) {
            const publishedAt = new Date(item.pubDate);
            
            // Skip old articles
            if (publishedAt < cutoffTime) {
                continue;
            }
            
            // Check if already processed
            const alreadyProcessed = await isArticleProcessed(item.link);
            if (alreadyProcessed) {
                continue;
            }
            
            // Check if anime-related
            if (!isAnimeRelated(item.title, item.description)) {
                continue;
            }
            
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
            });
            
            console.log(`[RSS] Found: ${item.title.substring(0, 60)}...`);
        }
        
        // Small delay between sources
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log(`[RSS] Found ${candidates.length} new articles`);
    return candidates;
}

/**
 * Generate a post from RSS article
 */
export function generateRSSPost(candidate: NewsCandidate, now: Date): any {
    const claimType = detectClaimType(candidate.title);
    const slug = candidate.link.split('/').pop()?.replace(/[^a-zA-Z0-9]/g, '-') || 
                 `rss-${Date.now()}`;
    
    // Determine post type
    let postType: 'INTEL' | 'TRENDING' | 'TRAILER' = 'INTEL';
    if (claimType === 'TRAILER_DROP') postType = 'TRAILER';
    else if (candidate.sourceType === 'BLOG') postType = 'TRENDING';
    
    return {
        id: crypto.randomUUID(),
        title: candidate.title,
        slug: slug.substring(0, 50),
        content: `${candidate.description}\n\nRead more: ${candidate.link}`,
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
