import { NextRequest, NextResponse } from 'next/server';
import { TwitterApi } from 'twitter-api-v2';
import { supabaseAdmin } from '@/lib/supabase/admin';

// Helper for X (existing logic)
async function publishToX(post: any, client: TwitterApi, mediaId?: string) {
    const domain = process.env.NEXT_PUBLIC_APP_URL || 'https://kumolabanime.com';
    const postUrl = `${domain}/blog/${post.slug}`;

    let tweetText = `${post.title}\n\n`;
    tweetText += `Read more at KumoLabAnime.com\n${postUrl}\n\n#Anime #KumoLab`;

    return await client.v2.tweet({
        text: tweetText,
        ...(mediaId ? { media: { media_ids: [mediaId] } } : {})
    });
}

// Helper for Meta (Facebook & Instagram)
async function publishToFacebook(post: any, imageUrl: string) {
    const accessToken = process.env.META_ACCESS_TOKEN;
    const pageId = process.env.META_PAGE_ID;

    if (!accessToken || !pageId) {
        return { success: false, error: 'Facebook configuration missing' };
    }

    const domain = process.env.NEXT_PUBLIC_APP_URL || 'https://kumolabanime.com';
    const postUrl = `${domain}/blog/${post.slug}`;
    const message = `${post.title}\n\nRead more at KumoLabAnime.com\n${postUrl}\n\n#Anime #KumoLab`;

    try {
        const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: imageUrl,
                message: message,
                access_token: accessToken
            })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        return { success: true, id: data.id };
    } catch (e: any) {
        console.error("Facebook Error:", e);
        return { success: false, error: e.message };
    }
}

async function publishToInstagram(post: any, imageUrl: string) {
    const accessToken = process.env.META_ACCESS_TOKEN;
    const igId = process.env.META_IG_ID;

    if (!accessToken || !igId) {
        return { success: false, error: 'Instagram configuration missing' };
    }

    const domain = process.env.NEXT_PUBLIC_APP_URL || 'https://kumolabanime.com';
    const postUrl = `${domain}/blog/${post.slug}`;
    const caption = `${post.title}\n\nRead more at KumoLabAnime.com\nLink in bio: ${postUrl}\n\n#Anime #KumoLab`;

    try {
        // 1. Create Media Container
        const containerRes = await fetch(`https://graph.facebook.com/v21.0/${igId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_url: imageUrl,
                caption: caption,
                access_token: accessToken
            })
        });
        const containerData = await containerRes.json();
        if (containerData.error) throw new Error(containerData.error.message);

        // 2. Publish Media
        const publishRes = await fetch(`https://graph.facebook.com/v21.0/${igId}/media_publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                creation_id: containerData.id,
                access_token: accessToken
            })
        });
        const publishData = await publishRes.json();
        if (publishData.error) throw new Error(publishData.error.message);

        return { success: true, id: publishData.id };
    } catch (e: any) {
        console.error("Instagram Error:", e);
        return { success: false, error: e.message };
    }
}

// Helper for Threads - Placeholder
async function publishToThreads(post: any, imageUrl: string) {
    // 1. Get Credentials
    const accessToken = process.env.THREADS_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
    const userId = process.env.THREADS_USER_ID || 'me';

    if (!accessToken) {
        return { success: false, error: 'Threads Access Token missing (THREADS_ACCESS_TOKEN or META_ACCESS_TOKEN)' };
    }

    const domain = process.env.NEXT_PUBLIC_APP_URL || 'https://kumolabanime.com';
    const postUrl = `${domain}/blog/${post.slug}`;
    const text = `${post.title}\n\nRead more at KumoLabAnime.com\n${postUrl}\n\n#Anime #KumoLab`;

    try {
        // 2. Create Media Container
        const containerUrl = `https://graph.threads.net/v1.0/${userId}/threads`;
        console.log('[Threads] Creating container at:', containerUrl);

        const containerRes = await fetch(containerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                media_type: 'IMAGE',
                image_url: imageUrl,
                text: text,
                access_token: accessToken
            })
        });

        const containerData = await containerRes.json();

        if (containerData.error || !containerData.id) {
            console.error('[Threads] Container Error:', containerData);
            return { success: false, error: containerData.error?.message || 'Failed to create container' };
        }

        const containerId = containerData.id;
        console.log('[Threads] Container Created:', containerId);

        // 3. Wait for processing (Threads requires this sometimes)
        // We'll verify status or just wait a bit.
        // For simplicity, we'll try to publish immediately, but usually a small delay is safe.
        await new Promise(r => setTimeout(r, 5000));

        // 4. Publish Media
        const publishUrl = `https://graph.threads.net/v1.0/${userId}/threads_publish`;
        const publishRes = await fetch(publishUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                creation_id: containerId,
                access_token: accessToken
            })
        });

        const publishData = await publishRes.json();

        if (publishData.error || !publishData.id) {
            console.error('[Threads] Publish Error:', publishData);
            return { success: false, error: publishData.error?.message || 'Failed to publish container' };
        }

        return { success: true, id: publishData.id };

    } catch (e: any) {
        console.error("Threads Network Error:", e);
        return { success: false, error: e.message };
    }
}

export async function POST(req: NextRequest) {
    try {
        // 0. Parse Options
        const { postId, platforms } = await req.json();
        // platforms: string[] e.g. ['x', 'instagram', 'facebook'] 
        // If undefined/empty, default to ALL for backward compatibility (or user intent)
        const targetPlatforms = (platforms && platforms.length > 0)
            ? platforms.map((p: string) => p.toLowerCase())
            : ['x', 'instagram', 'facebook'];

        if (!postId) return NextResponse.json({ error: 'Post ID is required' }, { status: 400 });

        const { data: post, error: fetchError } = await supabaseAdmin
            .from('posts')
            .select('*')
            .eq('id', postId)
            .single();

        if (fetchError || !post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

        const results: any = { x: null, facebook: null, instagram: null, threads: null };

        // 1. Prepare Media for X (Only if X is targeted)
        let xMediaId: string | undefined;
        let imageBuffer: Buffer | undefined;

        if (targetPlatforms.includes('x')) {
            if (post.image) {
                const imageRes = await fetch(post.image);
                if (imageRes.ok) {
                    imageBuffer = Buffer.from(await imageRes.arrayBuffer());
                }
            }

            // 2. Publish to X
            try {
                const xClient = new TwitterApi({
                    appKey: process.env.X_API_KEY || '',
                    appSecret: process.env.X_API_SECRET || '',
                    accessToken: process.env.X_ACCESS_TOKEN || '',
                    accessSecret: process.env.X_ACCESS_SECRET || '',
                });

                if (imageBuffer) {
                    xMediaId = await xClient.v1.uploadMedia(imageBuffer, { type: 'png' });
                }

                const xTweet = await publishToX(post, xClient, xMediaId);
                results.x = { success: true, id: xTweet.data.id };
            } catch (e: any) {
                console.error("X Social Error:", e);
                results.x = { success: false, error: e.message };
            }
        }

        // 3. Publish to Facebook
        if (targetPlatforms.includes('facebook')) {
            results.facebook = await publishToFacebook(post, post.image);
        }

        // 4. Publish to Instagram
        if (targetPlatforms.includes('instagram')) {
            results.instagram = await publishToInstagram(post, post.image);
        }

        // 5. Publish to Threads (Paused - but respecting logic if enabled later)
        if (targetPlatforms.includes('threads')) {
            // results.threads = await publishToThreads(post, post.image);
        }

        // If at least one platform succeeded, we consider the overall operation a success
        const platformSuccesses = Object.values(results).filter((r: any) => r && r.success).length;

        // Update post with social IDs
        // Wrap in try-catch so we don't fail the whole request if DB update fails (e.g. missing column)
        try {
            const socialIds: any = post.social_ids || {};
            if (results.x?.success) socialIds.twitter = results.x.id;
            if (results.facebook?.success) socialIds.facebook = results.facebook.id;
            if (results.instagram?.success) socialIds.instagram = results.instagram.id;
            if (results.threads?.success) socialIds.threads = results.threads.id;

            const { error: updateError } = await supabaseAdmin
                .from('posts')
                .update({
                    social_ids: socialIds,
                    is_published: true // Mark as published if we pushed to socials
                })
                .eq('id', postId);

            if (updateError) {
                console.error("DB Update Failed (Non-fatal for publishing):", updateError);
            }
        } catch (dbError) {
            console.error("DB Update Exception (Non-fatal, social posts likely live):", dbError);
        }

        if (platformSuccesses > 0) {
            return NextResponse.json({
                success: true,
                results,
                message: `Published to ${platformSuccesses} platform(s)`
            });
        } else {
            return NextResponse.json({
                success: false,
                results,
                error: "All platforms failed to publish"
            }, { status: 500 });
        }


    } catch (error: any) {
        console.error('Social Orchestrator Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
