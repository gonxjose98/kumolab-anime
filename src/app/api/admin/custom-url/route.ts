import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { detectDuplicate } from '@/lib/engine/duplicate-prevention';

export const dynamic = 'force-dynamic';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'AIzaSyAG95SlNgSuBQGnFcridjRUD8wRBTGC73g';

export async function POST(req: NextRequest) {
    try {
        const { url } = await req.json();

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
        excerpt: contentType === 'TRAILER' ? 'OFFICIAL TRAILER' : contentType,
        image: thumbnailUrl,
        youtube_video_id: videoId,
        youtube_url: url,
        youtube_embed_url: `https://www.youtube.com/embed/${videoId}`,
        source: channelName,
        source_tier: 1,
        timestamp: new Date().toISOString(),
        // studio_name, verification_badge, verification_score were dropped from
        // the v2 posts schema. PostgREST silently ignored them; we now omit them.
    };
}

async function processXUrl(url: string): Promise<any | null> {
    const match = url.match(/\/(?:status|statuses)\/(\d+)/);
    const tweetId = match ? match[1] : '';

    if (!tweetId) {
        throw new Error('Could not extract tweet ID from X URL');
    }

    // Check if already exists. twitter_tweet_id was dropped from v2 schema —
    // dedup now matches against content (which carries the URL containing the
    // tweet id) and source_url.
    const { data: existing } = await supabaseAdmin
        .from('posts')
        .select('id')
        .or(`source_url.eq.${url},content.ilike.%${tweetId}%`)
        .limit(1);

    if (existing && existing.length > 0) {
        throw new Error('This tweet has already been added');
    }

    // Extract username from URL
    const usernameMatch = url.match(/(?:twitter\.com|x\.com)\/([^\/]+)\//);
    const username = usernameMatch ? usernameMatch[1] : 'Unknown';

    // Try to fetch tweet content via X API if bearer token is available
    const bearerToken = process.env.X_BEARER_TOKEN;
    let tweetText = '';
    let mediaUrl = '';

    if (bearerToken) {
        try {
            const apiUrl = `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=text,entities&expansions=attachments.media_keys&media.fields=url,preview_image_url`;
            const resp = await fetch(apiUrl, {
                headers: { 'Authorization': `Bearer ${bearerToken}` },
                signal: AbortSignal.timeout(5000),
            });
            if (resp.ok) {
                const data = await resp.json();
                tweetText = data.data?.text || '';
                // Extract media
                if (data.includes?.media?.[0]) {
                    mediaUrl = data.includes.media[0].url || data.includes.media[0].preview_image_url || '';
                }
                if (!mediaUrl && data.data?.entities?.urls) {
                    for (const u of data.data.entities.urls) {
                        if (u.images?.[0]) { mediaUrl = u.images[0].url; break; }
                    }
                }
            }
        } catch {
            console.log('[Custom URL] Could not fetch tweet via API, using placeholder');
        }
    }

    // Smart title generation
    let title = `@${username} — New Post`;
    let postType = 'INTEL';

    if (tweetText) {
        const lower = tweetText.toLowerCase();
        let eventLabel = '';
        if (lower.includes('trailer') || lower.includes(' pv')) { eventLabel = 'Official Trailer'; postType = 'TRAILER'; }
        else if (lower.includes('teaser')) { eventLabel = 'Teaser'; postType = 'TRAILER'; }
        else if (lower.includes('season') && (lower.includes('confirmed') || lower.includes('announce'))) eventLabel = 'New Season Confirmed';
        else if (lower.includes('visual') || lower.includes('poster')) eventLabel = 'New Key Visual';
        else if (lower.includes('release date') || lower.includes('premiere')) eventLabel = 'Release Date Announced';
        else if (lower.includes('announce') || lower.includes('reveal') || lower.includes('confirm')) eventLabel = 'New Announcement';

        // Extract anime name
        let animeName = '';
        const quoted = tweetText.match(/["「『]([^"」』]{3,40})["」』]/);
        if (quoted) animeName = quoted[1];
        if (!animeName) {
            const tags = tweetText.match(/#([A-Za-z][A-Za-z0-9_]{2,30})/g);
            if (tags) {
                const skip = new Set(['anime', 'manga', 'trailer', 'pv', 'teaser', 'newanime']);
                const tag = tags.find(h => !skip.has(h.slice(1).toLowerCase()));
                if (tag) animeName = tag.slice(1).replace(/([a-z])([A-Z])/g, '$1 $2');
            }
        }
        if (!animeName) {
            animeName = tweetText.split(/\s+/).filter(w => w.length > 2 && !w.startsWith('http') && !w.startsWith('@') && !w.startsWith('#')).slice(0, 4).join(' ').replace(/[^\w\s'-]/g, '').trim();
        }

        if (animeName && eventLabel) title = `${animeName} — ${eventLabel}`;
        else if (animeName) title = `${animeName} — @${username} Announcement`;
        else if (eventLabel) title = `${eventLabel} — @${username}`;
    }

    // Build clean content
    let content: string;
    if (tweetText) {
        let cleanText = tweetText.replace(/https?:\/\/t\.co\/\S+/g, '').replace(/\s+/g, ' ').trim();
        cleanText = cleanText.replace(/(\s*#\w+){3,}$/, '').trim();
        content = `${cleanText}\n\nSource: @${username}\n${url}`;
    } else {
        content = `New post from @${username}.\n\nSource: @${username}\n${url}`;
    }

    return {
        id: crypto.randomUUID(),
        title,
        slug: `x-post-${username.toLowerCase()}-${tweetId.substring(0, 8)}`,
        content,
        type: postType,
        status: 'pending',
        is_published: false,
        image: mediaUrl,
        source_url: url,
        source: `@${username}`,
        source_tier: 2,
        timestamp: new Date().toISOString(),
        // twitter_tweet_id and twitter_url were dropped from v2 schema. The
        // source_url field carries the canonical link; that's the authoritative
        // pointer back to the tweet.
    };
}
