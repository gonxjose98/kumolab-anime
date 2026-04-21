/**
 * engine.ts — SLIMMED DOWN
 *
 * Responsibilities:
 * 1. Daily Drops (6 AM EST) — fetches AniList airing, auto-publishes
 * 2. Scheduled Post Publisher — publishes approved posts whose time has come
 *
 * All other scanning (RSS, YouTube, Newsroom) is handled by the
 * Detection Worker → Processing Worker pipeline. See detection-worker.ts.
 *
 * v2 storage rules: on publish we set expires_at for Fork 2 retention,
 * capture returned social IDs, and record the fingerprint in seen_fingerprints.
 */

import { fetchAniListAiring } from './fetchers';
import { logSchedulerRun } from '../logging/scheduler';
import { generateDailyDropsPost } from './generator';
import { getPosts } from '../blog';
import { BlogPost } from '@/types';
import { supabaseAdmin } from '../supabase/admin';
import { publishToSocials, SocialPublishResult } from '../social/publisher';

// Retention window for Fork 2. Unset / null / NaN → evergreen (Fork 1) behavior.
function getRetentionExpiry(now: Date): string | null {
    const raw = process.env.KUMOLAB_DEFAULT_RETENTION_DAYS;
    if (raw === undefined || raw === '' || raw === 'null') return null;
    const days = parseInt(raw, 10);
    if (!Number.isFinite(days) || days <= 0) return null;
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function buildSocialIds(result: SocialPublishResult): Record<string, string> {
    const entries = Object.entries(result).filter(([, v]) => !!v) as [string, string][];
    return Object.fromEntries(entries);
}

function computeFingerprint(title: string, url?: string): string {
    const normalized = title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim().substring(0, 80);
    const domain = (url || '').replace(/^https?:\/\//, '').split('/')[0] || '';
    let hash = 0;
    const input = normalized + '|' + domain;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) - hash) + input.charCodeAt(i);
        hash = hash & hash;
    }
    return `${normalized.replace(/\s/g, '_').substring(0, 40)}_${Math.abs(hash).toString(36)}`;
}

async function recordPublishedFingerprint(post: { title: string; source_url?: string | null; anime_id?: string | null; claim_type?: string | null; }) {
    if (!post.title) return;
    const fp = computeFingerprint(post.title, post.source_url || undefined);
    await supabaseAdmin.from('seen_fingerprints').upsert({
        fingerprint: fp,
        anime_id: post.anime_id ?? null,
        claim_type: post.claim_type ?? null,
        origin: 'published',
        source_url: post.source_url ?? null,
        seen_at: new Date().toISOString(),
    }, { onConflict: 'fingerprint' });
}

/**
 * Main engine function — now only handles Daily Drops.
 * Called by Vercel cron at 6 AM EST (worker=dailydrops).
 */
export async function runBlogEngine(slot: '06:00' | '08:00' | '12:00' | '16:00' | '20:00' | '15:00' | 'hourly', _force: boolean = false) {
    const now = new Date();

    const estFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: 'numeric', hour12: false
    });
    const parts = estFormatter.formatToParts(now);
    const findPart = (type: string) => parts.find(p => p.type === type)?.value || '';

    const y = findPart('year');
    const m = findPart('month');
    const d = findPart('day');
    const currentEstHour = parseInt(findPart('hour'));
    const estDateSlug = `${y}-${m}-${d}`;

    const existingPosts = await getPosts(true);
    const hasDailyDropsToday = existingPosts.some(p => p.type === 'DROP' && p.slug.includes(estDateSlug));

    console.log(`[Engine] Running at ${now.toISOString()} | EST: ${estDateSlug} ${currentEstHour}:00 | Trigger: ${slot}`);

    const isDailyDropsSlot = (slot === '06:00' && !hasDailyDropsToday) || (slot === 'hourly' && currentEstHour === 6 && !hasDailyDropsToday);

    if (!isDailyDropsSlot) {
        console.log('[Engine] Not a Daily Drops trigger. Nothing to do.');
        await logSchedulerRun(slot, 'skipped', 'Not a Daily Drops slot or already posted', {
            estHour: currentEstHour,
            hasDailyDropsToday
        });
        return null;
    }

    console.log(`[Engine] Generating Daily Drops. (EST Hour: ${currentEstHour}, Already Posted: ${hasDailyDropsToday})`);

    const startLimit = new Date(`${y}-${m}-${d}T00:00:00-05:00`);
    const endLimit = new Date(`${y}-${m}-${d}T23:59:59-05:00`);

    const episodes = await fetchAniListAiring(
        Math.floor(startLimit.getTime() / 1000),
        Math.floor(endLimit.getTime() / 1000)
    );

    const newPost = generateDailyDropsPost(episodes, now, estDateSlug);

    if (!newPost) {
        console.log('[Engine] Zero drops found for today. Skipping Daily Drops.');
        await logSchedulerRun(slot, 'skipped', 'No airing episodes found for today', { estDateSlug });
        return null;
    }

    await publishPost(newPost);
    await logSchedulerRun(slot, 'success', `Daily Drops published: ${newPost.title}`, {
        slug: newPost.slug,
        episodeCount: episodes.length
    });

    return newPost;
}

/**
 * Upserts a post to Supabase as "published," broadcasts it to socials,
 * captures returned IDs, and sets Fork-2 expiry. Used by Daily Drops.
 */
async function publishPost(post: BlogPost) {
    const now = new Date();
    const expiresAt = getRetentionExpiry(now);

    // First write — get a post row so we have something to update if socials succeed.
    const { error: insertError } = await supabaseAdmin
        .from('posts')
        .upsert([{
            title: post.title,
            slug: post.slug,
            type: post.type,
            content: post.content,
            image: post.image,
            timestamp: post.timestamp,
            is_published: true,
            claim_type: post.claimType ?? null,
            anime_id: post.anime_id ?? null,
            status: 'published',
            source_tier: (post as any).source_tier ?? 1,
            source: 'AniList',
            published_at: now.toISOString(),
            expires_at: expiresAt,
        }], { onConflict: 'slug' });

    if (insertError) {
        console.error('[Engine] Supabase publish error:', insertError);
        throw insertError;
    }

    // Social broadcast — non-blocking for post existence but we do await for IDs.
    let social: SocialPublishResult = {};
    try {
        social = await publishToSocials(post);
    } catch (e) {
        console.warn('[Engine] Social broadcast failed:', e);
    }

    if (Object.keys(social).length > 0) {
        await supabaseAdmin
            .from('posts')
            .update({ social_ids: buildSocialIds(social) })
            .eq('slug', post.slug);
    }

    await recordPublishedFingerprint({
        title: post.title,
        source_url: (post as any).source_url ?? null,
        anime_id: post.anime_id ?? null,
        claim_type: post.claimType ?? null,
    });

    try {
        const { revalidatePath } = await import('next/cache');
        revalidatePath('/');
        revalidatePath('/blog');
        revalidatePath(`/blog/${post.slug}`);
    } catch (e) {
        console.warn('[Engine] Revalidation failed:', e);
    }

    console.log(`[Engine] Published: ${post.title}`);
}

/**
 * Checks for scheduled/approved posts and publishes them.
 * Called by the processing worker cron (every hour).
 */
export async function publishScheduledPosts() {
    const now = new Date();
    console.log(`[Publisher] Checking for scheduled posts at ${now.toISOString()}`);

    const { data: scheduledPosts, error } = await supabaseAdmin
        .from('posts')
        .select('*')
        .eq('status', 'approved')
        .lte('scheduled_post_time', now.toISOString());

    if (error) {
        console.error('[Publisher] Error fetching scheduled posts:', error);
        return;
    }

    if (!scheduledPosts || scheduledPosts.length === 0) {
        console.log('[Publisher] No posts scheduled for this hour.');
        return;
    }

    console.log(`[Publisher] Found ${scheduledPosts.length} posts to publish.`);
    const expiresAt = getRetentionExpiry(now);

    for (const post of scheduledPosts) {
        try {
            console.log(`[Publisher] Publishing scheduled post: ${post.title}`);

            // Flip status up-front so a concurrent run can't double-publish.
            const { error: updateError } = await supabaseAdmin
                .from('posts')
                .update({
                    status: 'published',
                    is_published: true,
                    timestamp: now.toISOString(),
                    published_at: now.toISOString(),
                    expires_at: expiresAt,
                })
                .eq('id', post.id);

            if (updateError) {
                console.error(`[Publisher] Failed to update post ${post.id}:`, updateError);
                continue;
            }

            // Broadcast to socials, capture IDs.
            let social: SocialPublishResult = {};
            try {
                social = await publishToSocials(post as BlogPost);
            } catch (e) {
                console.warn(`[Publisher] Social broadcast failed for ${post.title}:`, e);
            }

            if (Object.keys(social).length > 0) {
                await supabaseAdmin
                    .from('posts')
                    .update({ social_ids: buildSocialIds(social) })
                    .eq('id', post.id);
            }

            await recordPublishedFingerprint({
                title: post.title,
                source_url: post.source_url ?? null,
                anime_id: post.anime_id ?? null,
                claim_type: post.claim_type ?? null,
            });

            try {
                const { revalidatePath } = await import('next/cache');
                revalidatePath('/');
                revalidatePath('/blog');
                revalidatePath(`/blog/${post.slug}`);
            } catch (e) {
                console.warn('[Publisher] Revalidation failed:', e);
            }

            console.log(`[Publisher] Successfully published: ${post.title}`);
        } catch (e) {
            console.error(`[Publisher] Error publishing post ${post.title}:`, e);
        }
    }
}
