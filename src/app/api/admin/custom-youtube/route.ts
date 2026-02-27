import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { detectDuplicate } from '@/lib/engine/duplicate-prevention';

export const dynamic = 'force-dynamic';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'AIzaSyAG95SlNgSuBQGnFcridjRUD8wRBTGC73g';

export async function POST(req: NextRequest) {
    try {
        const { youtubeUrl } = await req.json();

        if (!youtubeUrl || !youtubeUrl.includes('youtube.com') && !youtubeUrl.includes('youtu.be')) {
            return NextResponse.json({ error: 'Valid YouTube URL required' }, { status: 400 });
        }

        // Extract video ID
        let videoId = '';
        if (youtubeUrl.includes('v=')) {
            videoId = youtubeUrl.split('v=')[1]?.split('&')[0];
        } else if (youtubeUrl.includes('youtu.be/')) {
            videoId = youtubeUrl.split('youtu.be/')[1]?.split('?')[0];
        }

        if (!videoId || videoId.length < 5) {
            return NextResponse.json({ error: 'Could not extract video ID from URL' }, { status: 400 });
        }

        console.log(`[Custom Scan] Processing video: ${videoId}`);

        // Check if already exists
        const { data: existing } = await supabaseAdmin
            .from('posts')
            .select('id')
            .eq('youtube_video_id', videoId)
            .limit(1);

        if (existing && existing.length > 0) {
            return NextResponse.json({ 
                error: 'This video has already been added',
                existing: true 
            }, { status: 409 });
        }

        // Fetch video details from YouTube API
        const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            return NextResponse.json({ 
                error: `YouTube API error: ${response.status}` 
            }, { status: 500 });
        }

        const data = await response.json();
        
        if (!data.items || data.items.length === 0) {
            return NextResponse.json({ error: 'Video not found on YouTube' }, { status: 404 });
        }

        const video = data.items[0];
        const snippet = video.snippet;
        
        // Determine content type from title
        const title = snippet.title;
        const lowerTitle = title.toLowerCase();
        
        let contentType: 'TRAILER' | 'TEASER' | 'PV' | 'INTEL' = 'INTEL';
        if (lowerTitle.includes('trailer')) contentType = 'TRAILER';
        else if (lowerTitle.includes('teaser')) contentType = 'TEASER';
        else if (lowerTitle.includes('pv') || lowerTitle.includes('promo')) contentType = 'PV';

        // Extract anime name from title
        const cleanTitle = title
            .replace(/\s*-\s*/g, ' ')
            .replace(/official trailer/gi, '')
            .replace(/trailer/gi, '')
            .replace(/teaser/gi, '')
            .replace(/pv/gi, '')
            .replace(/season\s*\d+/gi, '')
            .replace(/\d+/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        const animeName = cleanTitle.substring(0, 50);

        // Build enhanced content
        const channelName = snippet.channelTitle;
        const description = snippet.description || '';
        const thumbnailUrl = snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url;

        const hashtags = [
            '#Anime',
            contentType === 'TRAILER' ? '#Trailer' : contentType === 'TEASER' ? '#Teaser' : '#PV',
            `#${animeName.replace(/[^a-zA-Z0-9]/g, '')}`,
            '#KumoLab'
        ].join(' ');

        const content = `🎬 **${contentType === 'TRAILER' ? 'OFFICIAL TRAILER DROP' : contentType + ' RELEASE'}**

${channelName} just released ${contentType.toLowerCase()} for **${animeName}**!

📺 **Watch the full video:**
${youtubeUrl}

${description ? description.substring(0, 200) + (description.length > 200 ? '...' : '') : 'Check out the latest anime content!'}

What are your thoughts? Drop your reactions below! 👇

${hashtags}

---

🎥 **Video Embed:**
https://www.youtube.com/embed/${videoId}`;

        // Create post object
        const post = {
            id: crypto.randomUUID(),
            title: title,
            slug: `${animeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50)}-${contentType.toLowerCase()}-${videoId.substring(0, 8)}`,
            content: content,
            type: contentType,
            status: 'pending',
            is_published: false,
            headline: contentType === 'TRAILER' ? 'OFFICIAL TRAILER' : contentType,
            image: thumbnailUrl,
            youtube_video_id: videoId,
            youtube_url: youtubeUrl,
            youtube_embed_url: `https://www.youtube.com/embed/${videoId}`,
            source: channelName,
            source_tier: 1,
            studio_name: channelName,
            verification_badge: `${channelName} Official`,
            verification_score: 90,
            timestamp: new Date().toISOString(),
        };

        // Check for duplicates
        const dupCheck = await detectDuplicate(post, { checkWindow: 168 }); // 7 days
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
            console.error('[Custom Scan] Insert error:', insertError);
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        console.log(`[Custom Scan] Successfully added: ${title}`);

        return NextResponse.json({
            success: true,
            message: 'Video added to pending approvals',
            post: {
                id: post.id,
                title: post.title,
                type: post.type,
                channel: channelName
            }
        });

    } catch (err: any) {
        console.error('[Custom Scan] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
