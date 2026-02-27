import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { detectDuplicate } from '@/lib/engine/duplicate-prevention';

export const dynamic = 'force-dynamic';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'AIzaSyAG95SlNgSuBQGnFcridjRUD8wRBTGC73g';

export async function POST(req: NextRequest) {
    try {
        const { youtubeUrl } = await req.json();
        const url = youtubeUrl;

        if (!url) {
            return NextResponse.json({ error: 'URL required' }, { status: 400 });
        }

        // Detect platform
        const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
        const isX = url.includes('twitter.com') || url.includes('x.com');

        if (!isYouTube && !isX) {
            return NextResponse.json({ error: 'Only YouTube and X (Twitter) URLs supported' }, { status: 400 });
        }

        let post: any;

        if (isYouTube) {
            post = await processYouTubeUrl(url);
        } else {
            post = await processXUrl(url);
        }

        if (!post) {
            return NextResponse.json({ error: 'Failed to process URL' }, { status: 500 });
        }

        // Check for duplicates
        const dupCheck = await detectDuplicate(post, { checkWindow: 168 });
        if (dupCheck.action === 'BLOCK') {
            return NextResponse.json({ 
                error: 'Similar post already exists',
                reason: dupCheck.reason 
            }, { status: 409 });
        }

        // Insert into database
        const { error: insertError } = await supabaseAdmin
            .from('posts')
            .insert([post]);

        if (insertError) {
            console.error('[Custom URL] Insert error:', insertError);
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        console.log(`[Custom URL] Successfully added: ${post.title}`);

        return NextResponse.json({
            success: true,
            message: `${isYouTube ? 'YouTube' : 'X'} post added to pending approvals`,
            post: {
                id: post.id,
                title: post.title,
                type: post.type,
                platform: isYouTube ? 'YouTube' : 'X'
            }
        });

    } catch (err: any) {
        console.error('[Custom URL] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

async function processYouTubeUrl(url: string): Promise<any | null> {
    // Extract video ID
    let videoId = '';
    if (url.includes('v=')) {
        videoId = url.split('v=')[1]?.split('&')[0];
    } else if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1]?.split('?')[0];
    }

    if (!videoId || videoId.length < 5) {
        throw new Error('Could not extract video ID from YouTube URL');
    }

    // Check if already exists
    const { data: existing } = await supabaseAdmin
        .from('posts')
        .select('id')
        .eq('youtube_video_id', videoId)
        .limit(1);

    if (existing && existing.length > 0) {
        throw new Error('This video has already been added');
    }

    // Fetch from YouTube API
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.items || data.items.length === 0) {
        throw new Error('Video not found on YouTube');
    }

    const video = data.items[0];
    const snippet = video.snippet;
    const title = snippet.title;
    const lowerTitle = title.toLowerCase();
    
    let contentType: 'TRAILER' | 'TEASER' | 'PV' | 'INTEL' = 'INTEL';
    if (lowerTitle.includes('trailer')) contentType = 'TRAILER';
    else if (lowerTitle.includes('teaser')) contentType = 'TEASER';
    else if (lowerTitle.includes('pv') || lowerTitle.includes('promo')) contentType = 'PV';

    const cleanTitle = title
        .replace(/\s*-\s*/g, ' ')
        .replace(/official trailer/gi, '')
        .replace(/trailer/gi, '')
        .replace(/teaser/gi, '')
        .replace(/pv/gi, '')
        .trim();

    const animeName = cleanTitle.substring(0, 50);
    const channelName = snippet.channelTitle;
    const description = snippet.description || '';
    const thumbnailUrl = snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url;

    const hashtags = ['#Anime', contentType === 'TRAILER' ? '#Trailer' : '#PV', `#${animeName.replace(/[^a-zA-Z0-9]/g, '')}`, '#KumoLab'].join(' ');

    return {
        id: crypto.randomUUID(),
        title: title,
        slug: `${animeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50)}-${contentType.toLowerCase()}-${videoId.substring(0, 8)}`,
        content: `🎬 **${contentType === 'TRAILER' ? 'OFFICIAL TRAILER' : contentType}**

${channelName} just released ${contentType.toLowerCase()} for **${animeName}**!

📺 **Watch:** ${url}

${description ? description.substring(0, 200) + (description.length > 200 ? '...' : '') : 'Check out the latest anime content!'}

${hashtags}

🎥 **Embed:** https://www.youtube.com/embed/${videoId}`,
        type: contentType,
        status: 'pending',
        is_published: false,
        headline: contentType === 'TRAILER' ? 'OFFICIAL TRAILER' : contentType,
        image: thumbnailUrl,
        youtube_video_id: videoId,
        youtube_url: url,
        youtube_embed_url: `https://www.youtube.com/embed/${videoId}`,
        source: channelName,
        source_tier: 1,
        studio_name: channelName,
        verification_badge: `${channelName} Official`,
        verification_score: 90,
        timestamp: new Date().toISOString(),
    };
}

async function processXUrl(url: string): Promise<any | null> {
    // Extract tweet ID from X URL
    // URL formats:
    // https://twitter.com/username/status/1234567890
    // https://x.com/username/status/1234567890
    
    const match = url.match(/\/(?:status|statuses)\/(\d+)/);
    const tweetId = match ? match[1] : '';

    if (!tweetId) {
        throw new Error('Could not extract tweet ID from X URL');
    }

    // Check if already exists
    const { data: existing } = await supabaseAdmin
        .from('posts')
        .select('id')
        .eq('twitter_tweet_id', tweetId)
        .limit(1);

    if (existing && existing.length > 0) {
        throw new Error('This tweet has already been added');
    }

    // Extract username from URL
    const usernameMatch = url.match(/(?:twitter\.com|x\.com)\/([^\/]+)\//);
    const username = usernameMatch ? usernameMatch[1] : 'Unknown';

    // Since we can't easily fetch tweet content without API keys,
    // create a placeholder post that the user can edit
    return {
        id: crypto.randomUUID(),
        title: `X Post from @${username}`,
        slug: `x-post-${username}-${tweetId.substring(0, 8)}`,
        content: `📱 **X (Twitter) Post**

From: @${username}
🔗 **Original post:** ${url}

[Edit this post to add description and context]`,
        type: 'INTEL',
        status: 'pending',
        is_published: false,
        headline: 'SO MEDIA UPDATE',
        image: '', // No image by default for X posts
        twitter_tweet_id: tweetId,
        twitter_url: url,
        source: `@${username} on X`,
        source_tier: 2,
        verification_badge: `@${username}`,
        verification_score: 70,
        timestamp: new Date().toISOString(),
    };
}
