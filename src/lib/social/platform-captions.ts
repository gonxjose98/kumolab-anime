import { buildSocialCaption } from './caption';

/*
 * The text each platform gets for a post. One source of truth: the publisher
 * posts these, and the Content tab's Captions popup shows these, so what Jose
 * sees is exactly what goes out.
 *
 * image_settings.captions keys: facebook, threads, threads_reply, x,
 * tiktok, tiktok_title. Instagram uses caption_override (or the auto caption).
 */

export interface PlatformCaptions {
    instagram: string;
    facebook: string;
    threads: string;
    /** Posted as the first reply under the Threads post (e.g. the title list). */
    threadsReply: string | null;
    x: string;
    /** TikTok is posted by hand from the phone; these are for copy-paste. */
    tiktokTitle: string | null;
    tiktok: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function platformCaptions(post: any): PlatformCaptions {
    const caps = post?.image_settings?.captions || post?.captions || {};
    const instagram = buildSocialCaption(post);
    const threads = str(caps.threads) ?? instagram;
    return {
        instagram,
        facebook: str(caps.facebook) ?? instagram,
        threads,
        threadsReply: str(caps.threads_reply),
        x: str(caps.x) ?? str(caps.threads) ?? String(post?.title || '').trim(),
        tiktokTitle: str(caps.tiktok_title),
        tiktok: str(caps.tiktok),
    };
}
