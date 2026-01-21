
import { BlogPost } from '@/types';

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const PAGE_ID = process.env.META_PAGE_ID;
const IG_USER_ID = process.env.META_IG_ID;

export async function publishToSocials(post: BlogPost) {
    if (!META_ACCESS_TOKEN) {
        console.warn('⚠️ Skipping Social Publish: No META_ACCESS_TOKEN');
        return;
    }

    console.log(`[Social] Starting broadcast for: ${post.title}`);

    // 1. Facebook Page Publish
    if (PAGE_ID) {
        try {
            // Get Page Token first (Best Practice)
            const accountsUrl = `https://graph.facebook.com/v18.0/me/accounts?access_token=${META_ACCESS_TOKEN}`;
            const accRes = await fetch(accountsUrl);
            const accData = await accRes.json();
            const pageData = accData.data?.find((p: any) => p.id === PAGE_ID);

            const tokenToUse = pageData?.access_token || META_ACCESS_TOKEN; // Fallback to User Token if Page fetch fails

            const fbUrl = `https://graph.facebook.com/v18.0/${PAGE_ID}/photos`;
            const fbParams = new URLSearchParams({
                url: post.image,
                message: `${post.title}\n\n${post.content}\n\nRead more at KumoLab.`,
                access_token: tokenToUse
            });

            const fbRes = await fetch(`${fbUrl}?${fbParams}`, { method: 'POST' });
            const fbData = await fbRes.json();

            if (fbData.id) {
                console.log(`✅ [Facebook] Published: ${fbData.post_id}`);
            } else {
                console.error(`❌ [Facebook] Failed:`, fbData);
            }
        } catch (e) {
            console.error(`❌ [Facebook] Network Error:`, e);
        }
    }

    // 2. Instagram Publish
    if (IG_USER_ID) {
        try {
            // A. Container
            const containerUrl = `https://graph.facebook.com/v18.0/${IG_USER_ID}/media`;
            const containerParams = new URLSearchParams({
                image_url: post.image,
                caption: `${post.title}\n\n${post.content.substring(0, 2100)}\n\n#anime #kumolab #animenews`,
                access_token: META_ACCESS_TOKEN
            });

            const containerRes = await fetch(`${containerUrl}?${containerParams}`, { method: 'POST' });
            const containerData = await containerRes.json();

            if (containerData.id) {
                // B. Publish
                const publishUrl = `https://graph.facebook.com/v18.0/${IG_USER_ID}/media_publish`;
                const publishParams = new URLSearchParams({
                    creation_id: containerData.id,
                    access_token: META_ACCESS_TOKEN
                });

                // Wait 4s for processing
                await new Promise(r => setTimeout(r, 4000));

                const publishRes = await fetch(`${publishUrl}?${publishParams}`, { method: 'POST' });
                const publishData = await publishRes.json();

                if (publishData.id) {
                    console.log(`✅ [Instagram] Published: ${publishData.id}`);
                } else {
                    console.error(`❌ [Instagram] Failed Publish Phase:`, publishData);
                }
            } else {
                console.error(`❌ [Instagram] Failed Container Phase:`, containerData);
            }
        } catch (e) {
            console.error(`❌ [Instagram] Network Error:`, e);
        }
    }
}
