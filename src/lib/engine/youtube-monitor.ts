/**
 * youtube-monitor.ts
 * Monitors YouTube channels for new anime trailers and content
 */

import { supabaseAdmin } from '../supabase/admin';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// Fallback API key (also set in env vars)
const FALLBACK_API_KEY = 'AIzaSyAG95SlNgSuBQGnFcridjRUD8wRBTGC73g';

// Default monitored channels - official anime sources
const DEFAULT_CHANNELS = [
    { id: 'UC6pGDc4luvCq5w1C9lt0v0g', name: 'Crunchyroll', tier: 1 },
    { id: 'UC0Q6wx_3LTWqWBp3Z6k5V0Q', name: 'Aniplex', tier: 1 },
    { id: 'UCp8LObSyk0vZ02NF4_7PcWg', name: 'TOHO Animation', tier: 1 },
    { id: 'UCZq1Ii0KaU4hJ3EyTL9RxXA', name: 'Kadokawa', tier: 1 },
    { id: 'UCx2x8m47eHqXq6WwR4h8ZFw', name: 'Muse Asia', tier: 2 },
    { id: 'UCF7C8P-qM01hgTCx5qX5Huw', name: 'Funimation', tier: 1 },
];

interface YouTubeVideo {
    id: string;
    title: string;
    description: string;
    publishedAt: string;
    channelId: string;
    channelTitle: string;
    thumbnails: {
        high?: { url: string };
        medium?: { url: string };
        default?: { url: string };
    };
}

interface TrailerCandidate {
    videoId: string;
    title: string;
    description: string;
    fullDescription: string;
    publishedAt: string;
    channelName: string;
    channelTier: number;
    thumbnailUrl: string;
    videoUrl: string;
    embedUrl: string;
    animeName: string;
    contentType: 'TRAILER' | 'TEASER' | 'PV' | 'CM' | 'OTHER';
    studioName: string;
}

/**
 * Fetch recent videos from a YouTube channel
 */
async function fetchChannelVideos(
    channelId: string, 
    apiKey: string,
    maxResults: number = 10
): Promise<YouTubeVideo[]> {
    try {
        // First, get the upload playlist ID for the channel
        const channelUrl = `${YOUTUBE_API_BASE}/channels?part=contentDetails&id=${channelId}&key=${apiKey}`;
        const channelRes = await fetch(channelUrl);
        
        if (!channelRes.ok) {
            console.error(`[YouTube] Failed to fetch channel ${channelId}:`, channelRes.status);
            return [];
        }
        
        const channelData = await channelRes.json();
        
        if (!channelData.items || channelData.items.length === 0) {
            console.error(`[YouTube] Channel not found: ${channelId}`);
            return [];
        }
        
        const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads;
        
        // Fetch recent videos from uploads playlist
        const playlistUrl = `${YOUTUBE_API_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}&key=${apiKey}`;
        const playlistRes = await fetch(playlistUrl);
        
        if (!playlistRes.ok) {
            console.error(`[YouTube] Failed to fetch playlist for ${channelId}:`, playlistRes.status);
            return [];
        }
        
        const playlistData = await playlistRes.json();
        
        return playlistData.items?.map((item: any) => ({
            id: item.snippet.resourceId.videoId,
            title: item.snippet.title,
            description: item.snippet.description,
            publishedAt: item.snippet.publishedAt,
            channelId: item.snippet.channelId,
            channelTitle: item.snippet.channelTitle,
            thumbnails: item.snippet.thumbnails,
        })) || [];
        
    } catch (error) {
        console.error(`[YouTube] Error fetching channel ${channelId}:`, error);
        return [];
    }
}

/**
 * Detect if a video is an anime trailer/teaser
 */
function detectTrailerType(title: string, description: string): { isTrailer: boolean; type: string; animeName: string } {
    const lowerTitle = title.toLowerCase();
    const lowerDesc = description.toLowerCase();
    
    // Skip non-trailer content
    const skipKeywords = ['review', 'reaction', 'analysis', 'explained', 'vs', 'top 10', 'ranking', 'amv', 'fan'];
    if (skipKeywords.some(kw => lowerTitle.includes(kw))) {
        return { isTrailer: false, type: 'OTHER', animeName: '' };
    }
    
    // Detect trailer types
    const trailerKeywords = ['official trailer', 'trailer', 'pv', 'promotional video'];
    const teaserKeywords = ['teaser', 'announcement'];
    const cmKeywords = ['cm', 'commercial'];
    
    let contentType: 'TRAILER' | 'TEASER' | 'PV' | 'CM' | 'OTHER' = 'OTHER';
    
    if (trailerKeywords.some(kw => lowerTitle.includes(kw))) {
        contentType = 'TRAILER';
    } else if (teaserKeywords.some(kw => lowerTitle.includes(kw))) {
        contentType = 'TEASER';
    } else if (cmKeywords.some(kw => lowerTitle.includes(kw))) {
        contentType = 'CM';
    } else {
        return { isTrailer: false, type: 'OTHER', animeName: '' };
    }
    
    // Extract anime name from title
    // Remove common trailer-related words
    let animeName = title
        .replace(/\s*-\s*/g, ' ')
        .replace(/official trailer/gi, '')
        .replace(/trailer/gi, '')
        .replace(/teaser/gi, '')
        .replace(/pv/gi, '')
        .replace(/season\s*\d+/gi, '')
        .replace(/\d+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    return { isTrailer: true, type: contentType, animeName };
}

/**
 * Extract studio name from video title or channel name
 */
function extractStudioName(title: string, channelName: string): string {
    const lowerTitle = title.toLowerCase();
    
    // Known studios in title
    const studioPatterns = [
        /\b(mappa)\b/i,
        /\b(ufotable)\b/i,
        /\b(kyoto animation|kyoani)\b/i,
        /\b(wit studio)\b/i,
        /\b(a-1 pictures)\b/i,
        /\b(madhouse)\b/i,
        /\b(production i\.g|production ig)\b/i,
        /\b(bones)\b/i,
        /\b(trigger)\b/i,
        /\b(cloverworks)\b/i,
        /\b(pierrot)\b/i,
        /\b(silver link)\b/i,
        /\b(doga kobo)\b/i,
        /\b(white fox)\b/i,
        /\b(tms entertainment)\b/i,
        /\b(p\.a\. works)\b/i,
    ];
    
    for (const pattern of studioPatterns) {
        const match = title.match(pattern);
        if (match) return match[1] || match[0];
    }
    
    // Check if channel name is a studio
    const studioChannels = ['mappa', 'ufotable', 'kyoto animation', 'wit studio', 'a-1 pictures'];
    const lowerChannel = channelName.toLowerCase();
    
    for (const studio of studioChannels) {
        if (lowerChannel.includes(studio)) {
            return studio.replace(/\b\w/g, l => l.toUpperCase());
        }
    }
    
    return channelName;
}

/**
 * Check if a video has already been processed
 */
async function isVideoProcessed(videoId: string): Promise<boolean> {
    const { data } = await supabaseAdmin
        .from('posts')
        .select('id')
        .eq('youtube_video_id', videoId)
        .limit(1);
    
    return !!(data && data.length > 0);
}

/**
 * Main function to scan all monitored channels for new trailers
 */
export async function scanYouTubeChannels(
    apiKey?: string,
    hoursBack: number = 24
): Promise<TrailerCandidate[]> {
    const key = apiKey || FALLBACK_API_KEY || process.env.YOUTUBE_API_KEY;
    console.log(`[YouTube] Scanning channels for trailers from last ${hoursBack} hours...`);
    
    const candidates: TrailerCandidate[] = [];
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    
    for (const channel of DEFAULT_CHANNELS) {
        console.log(`[YouTube] Checking ${channel.name}...`);
        
        const videos = await fetchChannelVideos(channel.id, key, 15);
        
        for (const video of videos) {
            const publishedAt = new Date(video.publishedAt);
            
            // Skip old videos
            if (publishedAt < cutoffTime) {
                continue;
            }
            
            // Check if already processed
            const alreadyProcessed = await isVideoProcessed(video.id);
            if (alreadyProcessed) {
                console.log(`[YouTube] Skipping already processed: ${video.title}`);
                continue;
            }
            
            // Detect if it's a trailer
            const detection = detectTrailerType(video.title, video.description);
            
            if (detection.isTrailer) {
                // Extract studio name from channel or title
                const studioName = extractStudioName(video.title, channel.name);
                
                candidates.push({
                    videoId: video.id,
                    title: video.title,
                    description: video.description.substring(0, 150),
                    fullDescription: video.description,
                    publishedAt: video.publishedAt,
                    channelName: channel.name,
                    channelTier: channel.tier,
                    thumbnailUrl: video.thumbnails.high?.url || video.thumbnails.medium?.url || video.thumbnails.default?.url,
                    videoUrl: `https://youtube.com/watch?v=${video.id}`,
                    embedUrl: `https://www.youtube.com/embed/${video.id}`,
                    animeName: detection.animeName,
                    contentType: detection.type as any,
                    studioName: studioName,
                });
                
                console.log(`[YouTube] Found ${detection.type}: ${video.title} (${studioName})`);
            }
        }
    }
    
    console.log(`[YouTube] Found ${candidates.length} new trailers`);
    return candidates;
}

/**
 * Generate enhanced content for trailer posts
 */
function generateTrailerContent(candidate: TrailerCandidate): string {
    const { animeName, contentType, channelName, videoUrl, embedUrl, studioName } = candidate;
    
    // Extract season info from title if present
    const seasonMatch = candidate.title.match(/season\s*(\d+|\w+)/i);
    const season = seasonMatch ? seasonMatch[0] : '';
    
    // Build hashtags
    const hashtags = [
        '#Anime',
        '#Trailer',
        `#${animeName.replace(/[^a-zA-Z0-9]/g, '')}`,
        season ? `#${season.replace(/\s/g, '')}` : '',
        `#${studioName || channelName}`,
        '#KumoLab'
    ].filter(Boolean).join(' ');
    
    // Generate content
    const content = `🎬 **${contentType === 'TRAILER' ? 'OFFICIAL TRAILER DROP' : contentType + ' RELEASE'}**

${studioName || channelName} just released the ${season || 'new'} ${contentType.toLowerCase()} for **${animeName}**!

▶️ **Watch the full trailer:**
${videoUrl}

${candidate.fullDescription ? extractKeyInfo(candidate.fullDescription) : 'The anticipation is building for this upcoming release!'}

What are your thoughts on this trailer? Drop your reactions below! 👇

${hashtags}

---

🎥 **Video Embed:**
${embedUrl}`;

    return content;
}

/**
 * Extract key information from video description
 */
function extractKeyInfo(description: string): string {
    if (!description || description.length < 10) {
        return 'Exciting new content has been revealed. Check out the trailer above!';
    }
    
    // Clean up description - remove timestamps, links, excessive formatting
    let cleaned = description
        .replace(/\d{1,2}:\d{2}(?::\d{2})?/g, '') // Remove timestamps
        .replace(/https?:\/\/\S+/g, '') // Remove URLs
        .replace(/[#*]/g, '') // Remove markdown
        .replace(/\n{3,}/g, '\n\n') // Normalize line breaks
        .trim();
    
    // Take first 2-3 sentences or first 300 chars
    const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const keyInfo = sentences.slice(0, 3).join('. ') || cleaned.substring(0, 300);
    
    return keyInfo + (cleaned.length > 300 ? '...' : '');
}

/**
 * Generate a post from a YouTube trailer
 */
export function generateTrailerPost(candidate: TrailerCandidate, now: Date): any {
    const contentType = candidate.contentType === 'TRAILER' ? 'TRAILER' : 
                        candidate.contentType === 'TEASER' ? 'TEASER' : 'INTEL';
    
    const headlinePrefix = candidate.contentType === 'TRAILER' ? 'OFFICIAL TRAILER' :
                          candidate.contentType === 'TEASER' ? 'TEASER REVEALED' :
                          candidate.contentType === 'PV' ? 'PROMO VIDEO' :
                          'NEW VIDEO';
    
    const slug = `${candidate.animeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${candidate.contentType.toLowerCase()}-${candidate.videoId.substring(0, 8)}`;
    
    const enhancedContent = generateTrailerContent(candidate);
    
    return {
        id: crypto.randomUUID(),
        title: candidate.title,
        slug: slug,
        content: enhancedContent,
        type: contentType,
        status: 'published', // Auto-publish trailers
        is_published: true,
        headline: headlinePrefix,
        image: candidate.thumbnailUrl,
        youtube_video_id: candidate.videoId,
        youtube_url: candidate.videoUrl,
        youtube_embed_url: candidate.embedUrl,
        source: candidate.channelName,
        source_tier: candidate.channelTier,
        studio_name: candidate.studioName,
        verification_badge: `${candidate.channelName} Official`,
        verification_score: candidate.channelTier === 1 ? 95 : 85,
        timestamp: now.toISOString(),
        // Skip pending approval - go straight to live
        skipApproval: true,
    };
}

export { DEFAULT_CHANNELS };
export type { TrailerCandidate, YouTubeVideo };
