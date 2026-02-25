import { NextRequest, NextResponse } from 'next/server';
import { scanYouTubeChannels, generateTrailerPost } from '@/lib/engine/youtube-monitor';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { action, hoursBack = 24 } = await req.json();
        
        if (action === 'scan-trailers') {
            // Try env var first, fallback to hardcoded key
            const apiKey = process.env.YOUTUBE_API_KEY || 'AIzaSyAG95SlNgSuBQGnFcridjRUD8wRBTGC73g';
            
            console.log(`[API] Manual YouTube scan triggered for last ${hoursBack} hours...`);
            
            const candidates = await scanYouTubeChannels(apiKey, hoursBack);
            
            if (candidates.length === 0) {
                return NextResponse.json({
                    success: true,
                    message: 'No new trailers found',
                    found: 0,
                    trailers: []
                });
            }
            
            // Process and optionally publish trailers
            const processed = [];
            const now = new Date();
            
            for (const candidate of candidates) {
                const post = generateTrailerPost(candidate, now);
                
                // Insert into database (auto-published)
                const { error } = await supabaseAdmin
                    .from('posts')
                    .insert([{
                        ...post,
                        timestamp: now.toISOString(),
                        is_published: true,
                        status: 'published'
                    }]);
                
                if (!error) {
                    processed.push({
                        title: post.title,
                        videoId: candidate.videoId,
                        channel: candidate.channelName,
                        url: candidate.videoUrl
                    });
                } else {
                    console.error(`[API] Failed to insert trailer:`, error);
                }
            }
            
            return NextResponse.json({
                success: true,
                message: `Processed ${processed.length} trailers`,
                found: candidates.length,
                published: processed.length,
                trailers: processed
            });
        }
        
        if (action === 'test-connection') {
            const apiKey = process.env.YOUTUBE_API_KEY || 'AIzaSyAG95SlNgSuBQGnFcridjRUD8wRBTGC73g';
            
            // Test API connection
            try {
                const testUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=UC6pGDc4luvCq5w1C9lt0v0g&key=${apiKey}`;
                const res = await fetch(testUrl);
                
                if (res.ok) {
                    return NextResponse.json({ 
                        connected: true,
                        message: 'YouTube API connection successful'
                    });
                } else {
                    return NextResponse.json({ 
                        connected: false,
                        error: `API returned ${res.status}`
                    });
                }
            } catch (e: any) {
                return NextResponse.json({ 
                    connected: false,
                    error: e.message
                });
            }
        }
        
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        
    } catch (error: any) {
        console.error('[YouTube API] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET() {
    // Status endpoint
    const apiKey = process.env.YOUTUBE_API_KEY || 'AIzaSyAG95SlNgSuBQGnFcridjRUD8wRBTGC73g';
    
    return NextResponse.json({
        configured: !!apiKey,
        message: apiKey ? 'YouTube API is configured' : 'YouTube API key not set'
    });
}
