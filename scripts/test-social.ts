import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { TwitterApi } from 'twitter-api-v2';
import { createClient } from '@supabase/supabase-js';

async function testSocial() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    const postId = '9cec2661-527b-4f8d-a398-125e49e21b69';
    console.log("Starting social test for ID:", postId);

    const { data: post, error: fetchError } = await supabaseAdmin
        .from('posts')
        .select('*')
        .eq('id', postId)
        .single();

    if (fetchError || !post) {
        console.error("Post not found:", fetchError);
        return;
    }

    const postUrl = `https://kumolab-anime.vercel.app/blog/${post.slug}`;
    const description = `${post.title}\n\nRead more: ${postUrl}\n\n#Anime #KumoLab`;

    console.log("Title:", post.title);
    console.log("Image:", post.image);

    // 1. X (Twitter)
    try {
        console.log("--- X ---");
        const xClient = new TwitterApi({
            appKey: process.env.X_API_KEY || '',
            appSecret: process.env.X_API_SECRET || '',
            accessToken: process.env.X_ACCESS_TOKEN || '',
            accessSecret: process.env.X_ACCESS_SECRET || '',
        });

        let mediaId;
        if (post.image) {
            console.log("Uploading media to X...");
            const imageRes = await fetch(post.image);
            const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
            mediaId = await xClient.v1.uploadMedia(imageBuffer, { mimeType: 'image/png' });
            console.log("Media ID:", mediaId);
        }

        const tweet = await xClient.v2.tweet({
            text: description,
            ...(mediaId ? { media: { media_ids: [mediaId] } } : {})
        });
        console.log("[X] SUCCESS! ID:", tweet.data.id);
    } catch (e: any) {
        console.error("[X] FAILED:", e.message);
        if (e.data) console.error("X Data:", JSON.stringify(e.data));
    }

    // 2. Facebook
    try {
        console.log("--- Facebook ---");
        const fbRes = await fetch(`https://graph.facebook.com/v21.0/${process.env.META_PAGE_ID}/photos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: post.image,
                message: description,
                access_token: process.env.META_ACCESS_TOKEN
            })
        });
        const fbData = await fbRes.json();
        if (fbData.error) {
            console.error("[Facebook] Error Data:", JSON.stringify(fbData.error));
            throw new Error(fbData.error.message);
        }
        console.log("[Facebook] SUCCESS! ID:", fbData.id);
    } catch (e: any) {
        console.error("[Facebook] FAILED:", e.message);
    }

    // 3. Instagram
    try {
        console.log("--- Instagram ---");
        const containerRes = await fetch(`https://graph.facebook.com/v21.0/${process.env.META_IG_ID}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_url: post.image,
                caption: description,
                access_token: process.env.META_ACCESS_TOKEN
            })
        });
        const containerData = await containerRes.json();
        if (containerData.error) {
            console.error("[Instagram Container] Error:", JSON.stringify(containerData.error));
            throw new Error(containerData.error.message);
        }

        const publishRes = await fetch(`https://graph.facebook.com/v21.0/${process.env.META_IG_ID}/media_publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                creation_id: containerData.id,
                access_token: process.env.META_ACCESS_TOKEN
            })
        });
        const publishData = await publishRes.json();
        if (publishData.error) {
            console.error("[Instagram Publish] Error:", JSON.stringify(publishData.error));
            throw new Error(publishData.error.message);
        }
        console.log("[Instagram] SUCCESS! ID:", publishData.id);
    } catch (e: any) {
        console.error("[Instagram] FAILED:", e.message);
    }
}

testSocial();
