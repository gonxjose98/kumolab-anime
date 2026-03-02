/**
 * x-monitor.ts
 * Monitors X (Twitter) for real-time anime announcements
 * Uses X API v2 with OAuth 1.0a authentication
 */

import { supabaseAdmin } from '../supabase/admin';
import { getXSources } from './dynamic-sources';
import crypto from 'crypto';

// X API Credentials from env vars
const X_API_KEY = process.env.X_API_KEY;
const X_API_SECRET = process.env.X_API_SECRET;
const X_ACCESS_TOKEN = process.env.X_ACCESS_TOKEN;
const X_ACCESS_TOKEN_SECRET = process.env.X_ACCESS_TOKEN_SECRET;
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
 * Generate OAuth 1.0a signature
 */
function generateOAuthSignature(
    method: string,
    url: string,
    params: Record<string, string>,
    consumerSecret: string,
    tokenSecret: string
): string {
    const sortedParams = Object.keys(params)
        .sort()
        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
        .join('&');
    
    const signatureBase = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
    const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
    
    return crypto.createHmac('sha1', signingKey).update(signatureBase).digest('base64');
}

/**
 * Build OAuth 1.0a header
 */
function buildOAuthHeader(
    method: string,
    url: string,
    apiKey: string,
    apiSecret: string,
    accessToken: string,
    accessTokenSecret: string
): string {
    const oauthParams: Record<string, string> = {
        oauth_consumer_key: apiKey,
        oauth_token: accessToken,
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_nonce: Math.random().toString(36).substring(2),
        oauth_version: '1.0'
    };
    
    oauthParams.oauth_signature = generateOAuthSignature(
        method,
        url,
        oauthParams,
        apiSecret,
        accessTokenSecret
    );
    
    const headerParts = Object.keys(oauthParams)
        .sort()
        .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`);
    
    return `OAuth ${headerParts.join(', ')}`;
}

/**
 * Fetch recent tweets from a user using X API v2 with OAuth 1.0a
 */
async function fetchUserTweetsOAuth(
    userId: string,
    maxResults: number = 5,
    accountInfo?: { handle: string; name: string; tier: number }
): Promise<XTweet[]> {
    // Check if we have OAuth credentials
    if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) {
        console.log('[X Monitor] OAuth credentials not configured, falling back to Bearer Token');
        return fetchUserTweetsBearer(userId, maxResults, accountInfo);
    }
    
    const baseUrl = `https://api.twitter.com/2/users/${userId}/tweets`;
    const queryParams = new URLSearchParams({
        max_results: maxResults.toString(),
        'tweet.fields': 'created_at,public_metrics,entities,referenced_tweets',
        expansions: 'attachments.media_keys',
        'media.fields': 'url,preview_image_url',
        exclude: 'retweets,replies'
    });
    
    const url = `${baseUrl}?${queryParams.toString()}`;
    
    const authHeader = buildOAuthHeader(
        'GET',
        baseUrl,
        X_API_KEY,
        X_API_SECRET,
        X_ACCESS_TOKEN,
        X_ACCESS_TOKEN_SECRET
    );
    
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': authHeader,
                'User-Agent': 'KumoLab-Monitor/1.0'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[X API OAuth] Error fetching user ${userId}: ${response.status} - ${errorText}`);
            // Fallback to Bearer Token
            return fetchUserTweetsBearer(userId, maxResults, accountInfo);
        }

        return parseTweetResponse(await response.json(), userId, accountInfo);
    } catch (error) {
        console.error(`[X API OAuth] Error:`, error);
        return fetchUserTweetsBearer(userId, maxResults, accountInfo);
    }
}

/**
 * Fetch with Bearer Token (fallback)
 */
async function fetchUserTweetsBearer(
    userId: string,
    maxResults: number = 5,
    accountInfo?: { handle: string; name: string; tier: number }
): Promise<XTweet[]> {
    if (!X_BEARER_TOKEN) {
        console.log('[X Monitor] Bearer Token not configured');
        return [];
    }
    
    const url = new URL(`https://api.twitter.com/2/users/${userId}/tweets`);
    url.searchParams.set('max_results', maxResults.toString());
    url.searchParams.set('tweet.fields', 'created_at,public_metrics,entities,referenced_tweets');
    url.searchParams.set('expansions', 'attachments.media_keys');
    url.searchParams.set('media.fields', 'url,preview_image_url');
    url.searchParams.set('exclude', 'retweets,replies');

    const response = await fetch(url.toString(), {
        headers: {
            'Authorization': `Bearer ${X_BEARER_TOKEN}`,
            'User-Agent': 'KumoLab-Monitor/1.0'
        }
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[X API Bearer] Error fetching user ${userId}: ${response.status} - ${errorText}`);
        return [];
    }

    return parseTweetResponse(await response.json(), userId, accountInfo);
}

/**
 * Parse tweet response
 */
function parseTweetResponse(
    data: any,
    userId: string,
    accountInfo?: { handle: string; name: string; tier: number }
): XTweet[] {
    const tweets: XTweet[] = [];
    const account = accountInfo || MONITORED_ACCOUNTS.find(a => a.id === userId);

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
        .single();
    
    return !!data;
}

/**
 * Scan all monitored X accounts for new anime announcements
 */
export async function scanXAccounts(maxPerAccount: number = 5): Promise<XTweet[]> {
    console.log('[X Monitor] Starting scan of monitored accounts...');
    
    // Check which auth method is available
    const hasOAuth = X_API_KEY && X_API_SECRET && X_ACCESS_TOKEN && X_ACCESS_TOKEN_SECRET;
    const hasBearer = !!X_BEARER_TOKEN;
    
    if (!hasOAuth && !hasBearer) {
        console.log('[X Monitor] No X API credentials configured');
        return [];
    }
    
    console.log(`[X Monitor] Auth: OAuth=${hasOAuth}, Bearer=${hasBearer}`);
    
    const allCandidates: XTweet[] = [];
    
    for (const account of MONITORED_ACCOUNTS) {
        try {
            let tweets: XTweet[];
            
            if (hasOAuth) {
                // Try OAuth first
                tweets = await fetchUserTweetsOAuth(account.id, maxPerAccount, account);
            } else {
                // Fall back to Bearer
                tweets = await fetchUserTweetsBearer(account.id, maxPerAccount, account);
            }
            
            for (const tweet of tweets) {
                // Check if already processed
                if (await isTweetProcessed(tweet.id)) {
                    continue;
                }
                
                // Check if it's an anime announcement
                if (isAnimeAnnouncement(tweet.text)) {
                    console.log(`[X Monitor] Found announcement from @${account.handle}: ${tweet.text.substring(0, 60)}...`);
                    allCandidates.push(tweet);
                }
            }
        } catch (error) {
            console.error(`[X Monitor] Error scanning @${account.handle}:`, error);
        }
    }
    
    console.log(`[X Monitor] Scan complete. Found ${allCandidates.length} new announcements.`);
    return allCandidates;
}

/**
 * Generate a post from X tweet
 */
export function generateXPost(tweet: XTweet, now: Date): any {
    return {
        title: `${tweet.authorName}: ${tweet.text.substring(0, 80)}${tweet.text.length > 80 ? '...' : ''}`,
        content: tweet.text,
        type: 'INTEL',
        source: `@${tweet.authorHandle}`,
        sourceTier: tweet.authorTier,
        timestamp: now.toISOString(),
        status: 'pending',
        isPublished: false,
        twitter_tweet_id: tweet.id,
        twitter_url: tweet.url,
        mediaUrls: tweet.mediaUrls,
        publicMetrics: tweet.publicMetrics
    };
}
