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
    maxResults: number = 5,
    accountInfo?: { handle: string; name: string; tier: number }
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

        const account = accountInfo || MONITORED_ACCOUNTS.find(a => a.id === userId);

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
            const tweets = await fetchUserTweets(account.id, bearerToken, 5, account);
            
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
 * Extract a smart title from tweet text.
 * Identifies anime name + event type for a clean, relevant title.
 */
function extractSmartTitle(text: string, authorName: string): { title: string; claimType: string; postType: string } {
    const lowerText = text.toLowerCase();
    let claimType = 'OTHER';
    let eventLabel = '';
    let postType = 'INTEL';

    if (lowerText.includes('trailer') || lowerText.includes(' pv')) {
        claimType = 'TRAILER_DROP'; eventLabel = 'Official Trailer'; postType = 'TRAILER';
    } else if (lowerText.includes('teaser')) {
        claimType = 'TRAILER_DROP'; eventLabel = 'Teaser'; postType = 'TRAILER';
    } else if (lowerText.includes('season') && (lowerText.includes('confirmed') || lowerText.includes('announce') || lowerText.includes('renewed'))) {
        claimType = 'NEW_SEASON_CONFIRMED'; eventLabel = 'New Season Confirmed';
    } else if (lowerText.includes('visual') || lowerText.includes('poster')) {
        claimType = 'NEW_KEY_VISUAL'; eventLabel = 'New Key Visual';
    } else if ((lowerText.includes('release date') || lowerText.includes('premiere')) && !lowerText.includes('trailer')) {
        claimType = 'DATE_ANNOUNCED'; eventLabel = 'Release Date Announced';
    } else if (lowerText.includes('cast') && (lowerText.includes('reveal') || lowerText.includes('announce'))) {
        claimType = 'CAST_ADDITION'; eventLabel = 'New Cast Revealed';
    } else if (lowerText.includes('delay') || lowerText.includes('postpone')) {
        claimType = 'DELAY'; eventLabel = 'Delayed';
    } else if (lowerText.includes('announce') || lowerText.includes('confirm') || lowerText.includes('reveal')) {
        eventLabel = 'New Announcement';
    }

    // Try to extract anime name from quoted titles, hashtags, or capitalized phrases
    let animeName = '';

    // Quoted titles: "Title" or 「Title」
    const quotedMatch = text.match(/["「『]([^"」』]{3,40})["」』]/);
    if (quotedMatch) animeName = quotedMatch[1];

    // Hashtag-based names
    if (!animeName) {
        const hashtags = text.match(/#([A-Za-z][A-Za-z0-9_]{2,30})/g);
        if (hashtags) {
            const genericTags = new Set(['anime', 'manga', 'trailer', 'pv', 'teaser', 'animetrailer', 'newanime', 'otaku']);
            const animeTag = hashtags.find(h => !genericTags.has(h.slice(1).toLowerCase()));
            if (animeTag) animeName = animeTag.slice(1).replace(/([a-z])([A-Z])/g, '$1 $2');
        }
    }

    // Capitalized phrases (likely anime titles)
    if (!animeName) {
        const capMatches = text.match(/(?:^|\s)([A-Z][a-zA-Z]+(?:\s+(?:[A-Z][a-zA-Z]+|[a-z]{1,3}|[0-9]+)){1,5})/g);
        if (capMatches) {
            const skipStarts = /^(From|Source|Watch|Click|Check|Season|Episode|Official|New|The This|That|Just|Will|Now|Out|More|Read|See|Get)\s/i;
            const cleaned = capMatches.map(m => m.trim()).filter(m => m.length > 4 && !skipStarts.test(m));
            if (cleaned.length > 0) animeName = cleaned.reduce((a, b) => a.length >= b.length ? a : b);
        }
    }

    // Fallback: first meaningful words
    if (!animeName) {
        animeName = text.split(/\s+/).filter(w => w.length > 2 && !w.startsWith('http') && !w.startsWith('@') && !w.startsWith('#')).slice(0, 5).join(' ').replace(/[^\w\s'-]/g, '').trim().substring(0, 50);
    }

    // Build title
    if (animeName && eventLabel) return { title: `${animeName} — ${eventLabel}`, claimType, postType };
    if (animeName) return { title: `${animeName} — ${authorName} Announcement`, claimType, postType };
    if (eventLabel) return { title: `${eventLabel} — ${authorName}`, claimType, postType };
    return { title: `${authorName} — New Announcement`, claimType, postType };
}

/**
 * Build a clean, readable caption from tweet text.
 */
function buildSmartCaption(text: string, url: string, authorHandle: string, authorName: string): string {
    let cleanText = text.replace(/https?:\/\/t\.co\/\S+/g, '').replace(/\s+/g, ' ').trim();
    cleanText = cleanText.replace(/(\s*#\w+){3,}$/, '').trim();
    return `${cleanText}\n\nSource: @${authorHandle} (${authorName})\n${url}`;
}

/**
 * Generate a post from an X announcement
 */
export function generateXPost(candidate: XTweet, now: Date): any {
    const { title, claimType, postType } = extractSmartTitle(candidate.text, candidate.authorName);
    const slug = `x-${candidate.authorHandle.toLowerCase()}-${candidate.id.substring(0, 8)}`;
    const content = buildSmartCaption(candidate.text, candidate.url, candidate.authorHandle, candidate.authorName);

    return {
        id: crypto.randomUUID(),
        title,
        slug,
        content,
        type: postType,
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
