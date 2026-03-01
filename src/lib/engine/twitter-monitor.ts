/**
 * twitter-monitor.ts
 * Monitors Twitter/X accounts via Nitter (free, no API key)
 * Nitter is a privacy-friendly alternative to Twitter's API
 */

import { supabaseAdmin } from '../supabase/admin';
import { getXSources } from './dynamic-sources';

// Official anime accounts to monitor
const MONITORED_ACCOUNTS = [
    { handle: 'Crunchyroll', name: 'Crunchyroll', tier: 1 },
    { handle: 'FUNimation', name: 'Funimation', tier: 1 },
    { handle: 'AniplexUSA', name: 'Aniplex', tier: 1 },
    { handle: 'MAPPA_Info', name: 'MAPPA', tier: 1 },
    { handle: 'kyoani', name: 'Kyoto Animation', tier: 1 },
    { handle: 'ufotable', name: 'Ufotable', tier: 1 },
    { handle: 'toho_animation', name: 'TOHO Animation', tier: 1 },
    { handle: 'KadokawaAnime', name: 'Kadokawa', tier: 1 },
    { handle: 'AnimeNewsNet', name: 'Anime News Network', tier: 2 },
    { handle: 'AniTrendz', name: 'AniTrendz', tier: 2 },
];

// Nitter instances (rotated for reliability)
const NITTER_INSTANCES = [
    'https://nitter.net',
    'https://nitter.it',
    'https://nitter.cz',
];

interface TweetCandidate {
    id: string;
    text: string;
    createdAt: string;
    authorHandle: string;
    authorName: string;
    authorTier: number;
    url: string;
    mediaUrls: string[];
    isRetweet: boolean;
    isReply: boolean;
}

/**
 * Fetch RSS feed from Nitter for a Twitter account
 */
async function fetchNitterFeed(
    handle: string,
    instanceIndex: number = 0,
    accountInfo?: { handle: string; name: string; tier: number }
): Promise<TweetCandidate[]> {
    const instance = NITTER_INSTANCES[instanceIndex % NITTER_INSTANCES.length];
    const rssUrl = `${instance}/${handle}/rss`;
    
    try {
        const response = await fetch(rssUrl, {
            headers: {
                'Accept': 'application/rss+xml, text/xml, application/xml',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        if (!response.ok) {
            console.error(`[Twitter] Nitter RSS failed for @${handle}: ${response.status}`);
            return [];
        }
        
        const xmlText = await response.text();
        
        // Parse RSS XML
        const items = xmlText.match(/<item>[\s\S]*?<\/item>/g) || [];
        
        return items.map(item => {
            const titleMatch = item.match(/<title>(.*?)<\/title>/);
            const linkMatch = item.match(/<link>(.*?)<\/link>/);
            const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
            const descriptionMatch = item.match(/<description>(.*?)<\/description>/);
            
            const title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : '';
            const link = linkMatch ? linkMatch[1] : '';
            const pubDate = pubDateMatch ? pubDateMatch[1] : '';
            const description = descriptionMatch ? decodeHtmlEntities(descriptionMatch[1]) : '';
            
            // Extract media URLs from description
            const mediaUrls: string[] = [];
            const imgMatches = description.match(/https:\/\/pbs\.twimg\.com\/media\/[^"\s]+/g);
            if (imgMatches) {
                mediaUrls.push(...imgMatches);
            }
            
            // Check if retweet or reply
            const isRetweet = title.startsWith('RT @');
            const isReply = title.startsWith('@');
            
            // Extract tweet ID from link
            const tweetId = link.split('/').pop() || '';
            
            return {
                id: tweetId,
                text: title.replace(/^RT @[^:]+: /, '').replace(/^@\S+\s*/, ''),
                createdAt: pubDate,
                authorHandle: handle,
                authorName: accountInfo?.name || MONITORED_ACCOUNTS.find(a => a.handle === handle)?.name || handle,
                authorTier: accountInfo?.tier || MONITORED_ACCOUNTS.find(a => a.handle === handle)?.tier || 3,
                url: link,
                mediaUrls,
                isRetweet,
                isReply,
            };
        });
        
    } catch (error) {
        console.error(`[Twitter] Error fetching @${handle}:`, error);
        return [];
    }
}

/**
 * Decode HTML entities in text
 */
function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

/**
 * Check if tweet contains anime-related keywords
 */
function isAnimeAnnouncement(text: string): boolean {
    const lowerText = text.toLowerCase();
    
    // Keywords that indicate anime announcements
    const announcementKeywords = [
        'trailer', 'pv', 'teaser', 'announce', 'confirmed',
        'release date', 'premiere', 'airing', 'season',
        'new visual', 'key visual', 'poster', 'cast',
        'staff', 'studio', 'production', 'adaptation'
    ];
    
    // Must have at least one keyword AND not be a generic tweet
    const hasKeyword = announcementKeywords.some(kw => lowerText.includes(kw));
    
    // Skip tweets that are just "watch now" or streaming announcements
    const skipPatterns = ['watch now', 'streaming now', 'episode', 'available now'];
    const shouldSkip = skipPatterns.some(p => lowerText.includes(p)) && 
                       !announcementKeywords.slice(0, 5).some(kw => lowerText.includes(kw));
    
    return hasKeyword && !shouldSkip;
}

/**
 * Check if tweet has already been processed
 */
async function isTweetProcessed(tweetId: string): Promise<boolean> {
    const { data } = await supabaseAdmin
        .from('posts')
        .select('id')
        .eq('twitter_tweet_id', tweetId)
        .limit(1);
    
    return !!(data && data.length > 0);
}

/**
 * Main function to scan all monitored Twitter accounts
 */
export async function scanTwitterAccounts(
    hoursBack: number = 6
): Promise<TweetCandidate[]> {
    console.log(`[Twitter] Scanning accounts for announcements from last ${hoursBack} hours...`);
    
    const candidates: TweetCandidate[] = [];
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    
    // Try dynamic sources first, fall back to hardcoded defaults
    const dynamicX = await getXSources();
    const accounts = dynamicX
        ? dynamicX.map(s => ({ handle: s.handle, name: s.name, tier: s.tier }))
        : MONITORED_ACCOUNTS;

    for (const account of accounts) {
        console.log(`[Twitter] Checking @${account.handle}...`);

        const tweets = await fetchNitterFeed(account.handle, 0, account);
        
        for (const tweet of tweets) {
            const createdAt = new Date(tweet.createdAt);
            
            // Skip old tweets
            if (createdAt < cutoffTime) {
                continue;
            }
            
            // Skip retweets and replies
            if (tweet.isRetweet || tweet.isReply) {
                continue;
            }
            
            // Check if already processed
            const alreadyProcessed = await isTweetProcessed(tweet.id);
            if (alreadyProcessed) {
                continue;
            }
            
            // Check if it's an anime announcement
            if (isAnimeAnnouncement(tweet.text)) {
                candidates.push(tweet);
                console.log(`[Twitter] Found announcement: ${tweet.text.substring(0, 60)}...`);
            }
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`[Twitter] Found ${candidates.length} new announcements`);
    return candidates;
}

/**
 * Generate a post from a Twitter announcement
 */
export function generateTwitterPost(candidate: TweetCandidate, now: Date): any {
    const slug = `twitter-${candidate.authorHandle.toLowerCase()}-${candidate.id.substring(0, 8)}`;
    
    // Extract anime name (simplified - take first 3-4 significant words)
    const words = candidate.text.split(/\s+/).filter(w => w.length > 3);
    const animeName = words.slice(0, 4).join(' ').replace(/[^a-zA-Z0-9\s]/g, '');
    
    return {
        id: crypto.randomUUID(),
        title: `${animeName} - Announcement from ${candidate.authorName}`,
        slug: slug,
        content: `${candidate.text}\n\nSource: ${candidate.url}`,
        type: 'INTEL',
        status: 'pending', // Twitter posts need approval
        is_published: false,
        headline: 'OFFICIAL ANNOUNCEMENT',
        image: candidate.mediaUrls[0] || '',
        twitter_tweet_id: candidate.id,
        twitter_url: candidate.url,
        source: candidate.authorName,
        source_tier: candidate.authorTier,
        verification_badge: `@${candidate.authorHandle} Official`,
        verification_score: candidate.authorTier === 1 ? 90 : 80,
        timestamp: now.toISOString(),
    };
}

export { MONITORED_ACCOUNTS, NITTER_INSTANCES };
export type { TweetCandidate };
