
import { TwitterApi } from 'twitter-api-v2';

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const TWITTER_BEARER_TOKEN = process.env.X_BEARER_TOKEN || process.env.X_ACCESS_TOKEN; // Using Access Token if Bearer not distinct

// Initialize Twitter Client (Read-Only context appropriate)
const twitterClient = new TwitterApi(TWITTER_BEARER_TOKEN || '');

export interface SocialStats {
    twitter?: { views: number; likes: number; comments: number; retweets: number };
    instagram?: { views: number; likes: number; comments: number };
    facebook?: { views: number; likes: number; comments: number };
}

export async function fetchSocialMetrics(ids: { twitter?: string; instagram?: string; facebook?: string }): Promise<SocialStats> {
    const stats: SocialStats = {};

    // 1. Twitter Metrics
    if (ids.twitter && TWITTER_BEARER_TOKEN) {
        try {
            // v2 API - public_metrics includes view_count, like_count, reply_count, retweet_count
            const tweet = await twitterClient.v2.singleTweet(ids.twitter, {
                'tweet.fields': ['public_metrics']
            });

            if (tweet.data) {
                const m = tweet.data.public_metrics;
                stats.twitter = {
                    // view_count is sometimes null for older tweets, default to 0
                    views: m?.impression_count || 0, // Note: API often calls this impression_count or view_count depending on endpoint version, v2 usually impression_count in non_public or view_count in public? Actually public_metrics has impression_count in some contexts but view_count is the standard public one. Let's try to access it safely.
                    // @ts-ignore - Type definition might struggle with dynamic fields
                    // Actually, let's just map standard fields
                    likes: m?.like_count || 0,
                    comments: m?.reply_count || 0,
                    retweets: m?.retweet_count || 0
                };

                // Manual fix for different type definitions
                // @ts-ignore
                if (m?.view_count !== undefined) stats.twitter.views = m.view_count;
            }
        } catch (e) {
            console.error('[Analytics] Twitter Fetch Error:', e);
        }
    }

    // 2. Instagram Metrics
    if (ids.instagram && META_ACCESS_TOKEN) {
        try {
            // Field selection: like_count, comments_count. 
            // Insights (impressions) require a separate edge and business permissions.
            // For simplicity/robustness, we'll start with basic interaction metrics and try insights if possible.
            const url = `https://graph.facebook.com/v18.0/${ids.instagram}?fields=like_count,comments_count&access_token=${META_ACCESS_TOKEN}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.id) {
                stats.instagram = {
                    views: 0, // Insights are tricky to fetch in single call, defaulting 0 for now unless we add strict insight fetching
                    likes: data.like_count || 0,
                    comments: data.comments_count || 0
                };

                // Try fetching insights (Impressions)
                try {
                    const insightsUrl = `https://graph.facebook.com/v18.0/${ids.instagram}/insights?metric=impressions&period=lifetime&access_token=${META_ACCESS_TOKEN}`;
                    const iRes = await fetch(insightsUrl);
                    const iData = await iRes.json();
                    if (iData.data && iData.data.length > 0) {
                        stats.instagram.views = iData.data[0].values[0].value;
                    }
                } catch (insightErr) {
                    // Fail silently, insights might restricted
                }
            }
        } catch (e) {
            console.error('[Analytics] Instagram Fetch Error:', e);
        }
    }

    // 3. Facebook Metrics
    if (ids.facebook && META_ACCESS_TOKEN) {
        try {
            // FB Post fields
            const url = `https://graph.facebook.com/v18.0/${ids.facebook}?fields=likes.summary(true),comments.summary(true)&access_token=${META_ACCESS_TOKEN}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.id) {
                stats.facebook = {
                    views: 0,
                    likes: data.likes?.summary?.total_count || 0,
                    comments: data.comments?.summary?.total_count || 0
                };

                // Try fetching insights (Impressions)
                try {
                    const insightsUrl = `https://graph.facebook.com/v18.0/${ids.facebook}/insights?metric=post_impressions&period=lifetime&access_token=${META_ACCESS_TOKEN}`;
                    const iRes = await fetch(insightsUrl);
                    const iData = await iRes.json();
                    if (iData.data && iData.data.length > 0) {
                        stats.facebook.views = iData.data[0].values[0].value;
                    }
                } catch (insightErr) {
                    // Fail silently
                }
            }
        } catch (e) {
            console.error('[Analytics] Facebook Fetch Error:', e);
        }
    }

    return stats;
}
