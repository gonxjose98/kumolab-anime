/**
 * x-monitor.ts
 * Monitors X (Twitter) for real-time anime announcements
 * Uses X API v2 (free tier: 100 requests/month)
 */

import { supabaseAdmin } from '../supabase/admin';
import { getXSources } from './dynamic-sources';

// X API v2 Bearer Token (set in env vars)
const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN;

// Default monitored accounts (used when no dynamic config exists)
const MONITORED_ACCOUNTS = [
    { id: '1567507580', handle: 'Crunchyroll', name: 'Crunchyroll', tier: 1 },
    { id: '18817213', handle: 'FUNimation', name: 'Funimation', tier: 1 },
    { id: '138176537', handle: 'AniplexUSA', name: 'Aniplex', tier: 1 },
    { id: '1032494551180222464', handle: 'MAPPA_Info', name: 'MAPPA', tier: 1 },
    { id: '100507039', handle: 'kyoani', name: 'Kyoto Animation', tier: 1 },
    { id: '96958501', handle: 'ufotable', name: 'Ufotable', tier: 1 },
    { id: '294510573', handle: 'toho_animation', name: 'TOHO Animation', tier: 1 },
    { id: '164224501', handle: 'KadokawaAnime', name: 'Kadokawa', tier: 1 },
    { id: '11964382', handle: 'AnimeNewsNet', name: 'Anime News Network', tier: 2 },
    { id: '187460970', handle: 'AniTrendz', name: 'AniTrendz', tier: 2 },
    { id: '80384892', handle: 'NetflixAnime', name: 'Netflix Anime', tier: 1 },
    { id: '2762868188', handle: 'HIDIVEofficial', name: 'HIDIVE', tier: 2 },
];

interface XTweet {
    id: string;
    text: string;
    createdAt: string;
    authorId: string;
    authorHandle: string;
    authorName: string;
    authorTier: number;
    url: string;
    mediaUrls: string[];
    isRetweet: boolean;
    isReply: boolean;
    publicMetrics?: {
        retweetCount: number;
        replyCount: number;
        likeCount: number;
        quoteCount: number;
    };
}

/**
 * Fetch recent tweets from a user using X API v2
 */
async function fetchUserTweets(
    userId: string,
    bearerToken: string,
    maxResults: number = 5
): Promise<XTweet[]> {
    const url = new URL(`https://api.twitter.com/2/users/${userId}/tweets`);
    url.searchParams.set('max_results', maxResults.toString());
    url.searchParams.set('tweet.fields', 'created_at,public_metrics,entities,referenced_tweets');
    url.searchParams.set('expansions', 'attachments.media_keys');
    url.searchParams.set('media.fields', 'url,preview_image_url');
    url.searchParams.set('exclude', 'retweets,replies');

    const response = await fetch(url.toString(), {
        headers: {
            'Authorization': `Bearer ${bearerToken}`,
            'User-Agent': 'KumoLab-Monitor/1.0'
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[X API] Error fetching user ${userId}: ${response.status} - ${errorText}`);
        return [];
    }

    const data = await response.json();
    const tweets: XTweet[] = [];

    for (const tweet of data.data || []) {
        // Extract media URLs
        const mediaUrls: string[] = [];
        if (tweet.entities?.urls) {
            for (const url of tweet.entities.urls) {
                if (url.images) {
                    mediaUrls.push(url.images[0].url);
                }
            }
        }

        // Check if retweet or reply
        const isRetweet = tweet.referenced_tweets?.some((ref: any) => ref.type === 'retweeted') || false;
        const isReply = tweet.referenced_tweets?.some((ref: any) => ref.type === 'replied_to') || false;

        // Skip if it's a retweet or reply
        if (isRetweet || isReply) continue;

        const account = MONITORED_ACCOUNTS.find(a => a.id === userId);

        tweets.push({
            id: tweet.id,
            text: tweet.text,
            createdAt: tweet.created_at,
            authorId: userId,
            authorHandle: account?.handle || 'unknown',
            authorName: account?.name || 'Unknown',
            authorTier: account?.tier || 3,
            url: `https://twitter.com/${account?.handle || 'user'}/status/${tweet.id}`,
            mediaUrls,
            isRetweet,
            isReply,
            publicMetrics: tweet.public_metrics
        });
    }

    return tweets;
}

/**
 * Check if tweet contains anime announcement keywords
 */
function isAnimeAnnouncement(text: string): boolean {
    const lowerText = text.toLowerCase();
    
    // Keywords that indicate anime announcements
    const announcementKeywords = [
        'trailer', 'pv', 'teaser', 'announce', 'confirmed', 'revealed',
        'release date', 'premiere', 'airing', 'season', 'sequel',
        'new visual', 'key visual', 'poster', 'cast', 'staff',
        'studio', 'production', 'adaptation', 'greenlit'
    ];
    
    // Must have at least one keyword
    const hasKeyword = announcementKeywords.some(kw => lowerText.includes(kw));
    
    // Skip generic tweets
    const skipPatterns = ['watch now', 'streaming now', 'available now', 'out now'];
    const isGeneric = skipPatterns.some(p => lowerText.includes(p)) && 
                      !announcementKeywords.slice(0, 6).some(kw => lowerText.includes(kw));
    
    return hasKeyword && !isGeneric;
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
 * Main function to scan all monitored X accounts
 */
export async function scanXAccounts(
    hoursBack: number = 6
): Promise<XTweet[]> {
    const bearerToken = X_BEARER_TOKEN || process.env.X_BEARER_TOKEN;

    if (!bearerToken) {
        console.log('[X Monitor] No bearer token configured, skipping X scan');
        return [];
    }

    // Try dynamic sources first, fall back to hardcoded defaults
    const dynamicX = await getXSources();
    const accounts = dynamicX
        ? dynamicX.map(s => ({ id: s.id || '', handle: s.handle, name: s.name, tier: s.tier }))
        : MONITORED_ACCOUNTS;

    console.log(`[X Monitor] Scanning ${accounts.length} accounts for announcements...`);

    const candidates: XTweet[] = [];
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    for (const account of accounts) {
        console.log(`[X Monitor] Checking @${account.handle}...`);
        
        try {
            const tweets = await fetchUserTweets(account.id, bearerToken, 5);
            
            for (const tweet of tweets) {
                const createdAt = new Date(tweet.createdAt);
                
                // Skip old tweets
                if (createdAt < cutoffTime) {
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
                    console.log(`[X Monitor] Found announcement from @${account.handle}: ${tweet.text.substring(0, 60)}...`);
                }
            }
        } catch (error) {
            console.error(`[X Monitor] Error scanning @${account.handle}:`, error);
        }
        
        // Delay between accounts to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`[X Monitor] Found ${candidates.length} new announcements`);
    return candidates;
}

/**
 * Generate a post from an X announcement
 */
export function generateXPost(candidate: XTweet, now: Date): any {
    const slug = `x-${candidate.authorHandle.toLowerCase()}-${candidate.id.substring(0, 8)}`;
    
    // Extract anime name (first 3-4 significant words)
    const words = candidate.text.split(/\s+/).filter(w => w.length > 3 && !w.startsWith('http'));
    const animeName = words.slice(0, 4).join(' ').replace(/[^a-zA-Z0-9\s]/g, '');
    
    // Detect claim type
    const lowerText = candidate.text.toLowerCase();
    let claimType = 'OTHER';
    if (lowerText.includes('trailer') || lowerText.includes('pv')) claimType = 'TRAILER_DROP';
    else if (lowerText.includes('season') && (lowerText.includes('confirmed') || lowerText.includes('announce'))) claimType = 'NEW_SEASON_CONFIRMED';
    else if (lowerText.includes('visual') || lowerText.includes('poster')) claimType = 'NEW_KEY_VISUAL';
    else if (lowerText.includes('date') || lowerText.includes('premiere')) claimType = 'DATE_ANNOUNCED';
    else if (lowerText.includes('cast')) claimType = 'CAST_ADDITION';
    else if (lowerText.includes('delay') || lowerText.includes('postpone')) claimType = 'DELAY';

    return {
        id: crypto.randomUUID(),
        title: `${animeName} — Announcement from ${candidate.authorName}`,
        slug: slug,
        content: `${candidate.text}\n\nSource: ${candidate.url}`,
        type: 'INTEL',
        claim_type: claimType,
        status: 'pending',
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

export { MONITORED_ACCOUNTS };
export type { XTweet };
