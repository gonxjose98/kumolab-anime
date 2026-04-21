import { BlogPost } from '@/types';

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const IG_USER_ID = process.env.META_IG_ID;

export interface SocialPublishResult {
    instagram_id?: string;
    instagram_url?: string;
}

/**
 * Publishes a post to Instagram only. Meta Suite is configured on Jose's side
 * to cross-post IG → Facebook + Threads automatically, so publishing to FB or
 * Threads directly from here would duplicate every post. Do NOT add a direct
 * FB or Threads publish path.
 */
export async function publishToSocials(post: BlogPost): Promise<SocialPublishResult> {
    const result: SocialPublishResult = {};

    if (!META_ACCESS_TOKEN) {
        console.warn('⚠️ Skipping Social Publish: No META_ACCESS_TOKEN');
        return result;
    }

    if (process.env.AUTO_PUBLISH_SOCIALS !== 'true') {
        console.warn(`⚠️ [Social] Auto-publish disabled. Skipping broadcast for: ${post.title}`);
        return result;
    }

    console.log(`[Social] Starting IG broadcast for: ${post.title}`);

    if (!IG_USER_ID) {
        console.warn('[Social] META_IG_ID not set — skipping IG broadcast');
        return result;
    }

    try {
        const containerUrl = `https://graph.facebook.com/v18.0/${IG_USER_ID}/media`;
        const containerParams = new URLSearchParams({
            image_url: post.image || '',
            caption: `${post.title}\n\n${post.content.substring(0, 2100)}\n\n#anime #kumolab #animenews`,
            access_token: META_ACCESS_TOKEN || ''
        });

        const containerRes = await fetch(`${containerUrl}?${containerParams}`, { method: 'POST' });
        const containerData = await containerRes.json();

        if (!containerData.id) {
            console.error(`❌ [Instagram] Failed Container Phase:`, containerData);
            return result;
        }

        const publishUrl = `https://graph.facebook.com/v18.0/${IG_USER_ID}/media_publish`;
        const publishParams = new URLSearchParams({
            creation_id: containerData.id,
            access_token: META_ACCESS_TOKEN || ''
        });

        // IG needs ~4s to process the media container before publish.
        await new Promise(r => setTimeout(r, 4000));

        const publishRes = await fetch(`${publishUrl}?${publishParams}`, { method: 'POST' });
        const publishData = await publishRes.json();

        if (publishData.id) {
            result.instagram_id = publishData.id;
            result.instagram_url = `https://instagram.com/p/${publishData.id}`;
            console.log(`✅ [Instagram] Published: ${publishData.id} (Meta Suite will cross-post to FB + Threads)`);
        } else {
            console.error(`❌ [Instagram] Failed Publish Phase:`, publishData);
        }
    } catch (e) {
        console.error(`❌ [Instagram] Network Error:`, e);
    }

    return result;
}
