/**
 * engine.ts — SLIMMED DOWN
 *
 * Responsibilities:
 * 1. Daily Drops (6 AM EST) — fetches AniList airing, auto-publishes
 * 2. Scheduled Post Publisher — publishes approved posts whose time has come
 *
 * All other scanning (RSS, YouTube, Newsroom) is now handled by the
 * Detection Worker → Processing Worker pipeline. See detection-worker.ts.
 */

import { fetchAniListAiring } from './fetchers';
import { logSchedulerRun } from '../logging/scheduler';
import { generateDailyDropsPost } from './generator';
import { getPosts } from '../blog';
import { BlogPost } from '@/types';
import fs from 'fs';
import path from 'path';

import { supabaseAdmin } from '../supabase/admin';

const POSTS_PATH = path.join(process.cwd(), 'src/data/posts.json');
const USE_SUPABASE = process.env.NEXT_PUBLIC_USE_SUPABASE === 'true';

/**
 * Main engine function — now only handles Daily Drops.
 * Called by Vercel cron at 6 AM EST (worker=dailydrops).
 */
export async function runBlogEngine(slot: '06:00' | '08:00' | '12:00' | '16:00' | '20:00' | '15:00' | 'hourly', force: boolean = false) {
    const now = new Date();

    // Convert to EST wall clock
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

    // --- DAILY DROPS (SINGLE FIRE @ 6 AM EST) ---
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

    // EST day window
    const startLimit = new Date(`${y}-${m}-${d}T00:00:00-05:00`);
    const endLimit = new Date(`${y}-${m}-${d}T23:59:59-05:00`);

    console.log(`[Engine] Filtering airing from ${startLimit.toISOString()} to ${endLimit.toISOString()} (EST Window)`);

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

    // Publish Daily Drops immediately
    await publishPost(newPost);
    await logSchedulerRun(slot, 'success', `Daily Drops published: ${newPost.title}`, {
        slug: newPost.slug,
        episodeCount: episodes.length
    });

    return newPost;
}

/**
 * Publishes a post to either Supabase or the local JSON file.
 */
async function publishPost(post: BlogPost) {
    if (USE_SUPABASE) {
        const { error } = await supabaseAdmin
            .from('posts')
            .upsert([{
                title: post.title,
                slug: post.slug,
                type: post.type,
                content: post.content,
                image: post.image,
                timestamp: post.timestamp,
                is_published: post.status === 'published' && post.isPublished === true,
                claim_type: post.claimType,
                premiere_date: post.premiereDate,
                event_fingerprint: post.event_fingerprint,
                truth_fingerprint: post.truth_fingerprint,
                anime_id: post.anime_id,
                season_label: post.season_label,
                verification_tier: post.verification_tier,
                verification_reason: post.verification_reason,
                verification_sources: post.verification_sources,
                status: post.status || 'pending',
                source_tier: (post as any).source_tier || 1,
                scraped_at: post.timestamp,
                source: 'AniList',
                background_image: post.background_image,
                image_settings: post.image_settings,
            }], { onConflict: 'slug' });

        if (error) {
            console.error('Supabase publish error:', error);
            throw error;
        }

        console.log(`[Engine] Daily Drops saved to DB.`);
    } else {
        const fileContents = fs.readFileSync(POSTS_PATH, 'utf8');
        const posts: BlogPost[] = JSON.parse(fileContents);
        posts.unshift(post);
        fs.writeFileSync(POSTS_PATH, JSON.stringify(posts, null, 2));
    }

    // Revalidate
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

    if (!USE_SUPABASE) return;

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

    for (const post of scheduledPosts) {
        try {
            console.log(`[Publisher] Publishing scheduled post: ${post.title}`);

            const { error: updateError } = await supabaseAdmin
                .from('posts')
                .update({
                    status: 'published',
                    is_published: true,
                    timestamp: now.toISOString()
                })
                .eq('id', post.id);

            if (updateError) {
                console.error(`[Publisher] Failed to update post ${post.id}:`, updateError);
                continue;
            }

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
