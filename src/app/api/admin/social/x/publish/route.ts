import { NextRequest, NextResponse } from 'next/server';
import { TwitterApi } from 'twitter-api-v2';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
    try {
        const { postId } = await req.json();

        if (!postId) {
            return NextResponse.json({ error: 'Post ID is required' }, { status: 400 });
        }

        // 1. Fetch Post Data from Supabase
        const { data: post, error: fetchError } = await supabaseAdmin
            .from('posts')
            .select('*')
            .eq('id', postId)
            .single();

        if (fetchError || !post) {
            return NextResponse.json({ error: 'Post not found' }, { status: 404 });
        }

        // 2. Initialize X Client
        // Note: X API V2 requires OAuth 1.0a (Consumer Key/Secret + Access Token/Secret) for posting with media
        const consumerKey = process.env.X_API_KEY || '';
        const consumerSecret = process.env.X_API_SECRET || '';
        const accessToken = process.env.X_ACCESS_TOKEN || '';
        const accessSecret = process.env.X_ACCESS_SECRET || '';

        if (!consumerKey || !consumerSecret || !accessToken || !accessSecret) {
            console.error('Missing X API credentials in environment');
            return NextResponse.json({
                error: 'X API Credentials missing. Need API Key (Consumer Key) and API Key Secret (Consumer Secret).'
            }, { status: 500 });
        }

        const client = new TwitterApi({
            appKey: consumerKey,
            appSecret: consumerSecret,
            accessToken: accessToken,
            accessSecret: accessSecret,
        });

        // 3. Handle Image Media Upload (Optional but recommended for KumoLab aesthetic)
        let mediaId: string | undefined;
        if (post.image) {
            try {
                // Fetch image from URL
                const imageRes = await fetch(post.image);
                if (imageRes.ok) {
                    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

                    // Upload to X
                    // We use v1.1 for media upload as it's the most stable for images
                    mediaId = await client.v1.uploadMedia(imageBuffer, { type: 'png' });
                }
            } catch (mediaError) {
                console.error('Failed to upload media to X:', mediaError);
                // We'll continue without media if it fails, or we could error out
            }
        }

        // 4. Construct Tweet Text
        // Aesthetic: Title + Link + Handles
        const domain = process.env.NEXT_PUBLIC_SITE_URL || 'https://kumolab-anime.vercel.app';
        const postUrl = `${domain}/blog/${post.slug}`;

        let tweetText = `${post.title}\n\n`;

        // Add excerpt if available
        if (post.content) {
            const excerpt = post.content.substring(0, 150) + (post.content.length > 150 ? '...' : '');
            tweetText += `${excerpt}\n\n`;
        }

        tweetText += `Read more: ${postUrl}\n\n#Anime #KumoLab`;

        // 5. Post to X
        const tweet = await client.v2.tweet({
            text: tweetText,
            ...(mediaId ? { media: { media_ids: [mediaId] } } : {})
        });

        return NextResponse.json({
            success: true,
            tweetId: tweet.data.id,
            url: `https://x.com/user/status/${tweet.data.id}`
        });

    } catch (error: any) {
        console.error('X Publish Error:', error);
        return NextResponse.json({ error: error.message || 'Failed to publish to X' }, { status: 500 });
    }
}
