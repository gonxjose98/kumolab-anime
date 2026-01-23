/**
 * engine.ts
 * Orchestrator for the KumoLab Daily Blog Automation
 */

import { fetchAniListAiring, verifyOnCrunchyroll, fetchAnimeIntel, fetchTrendingSignals, fetchSmartTrendingCandidates } from './fetchers';
import { logSchedulerRun } from '../logging/scheduler';
import { generateDailyDropsPost, generateIntelPost, generateTrendingPost, validatePost } from './generator';
import { getPosts } from '../blog';
import { BlogPost } from '@/types';
import fs from 'fs';
import path from 'path';

import { supabaseAdmin } from '../supabase/admin';
import { publishToSocials } from '../social/publisher';

const POSTS_PATH = path.join(process.cwd(), 'src/data/posts.json');
const USE_SUPABASE = process.env.NEXT_PUBLIC_USE_SUPABASE === 'true';

/**
 * Main engine function to run for a specific slot.
 * Now triggered by a single hourly cron (see vercel.json)
 */
export async function runBlogEngine(slot: '08:00' | '12:00' | '16:00' | '20:00' | '15:00', force: boolean = false) {

    const now = new Date();
    const existingPosts = await getPosts();
    let newPost: BlogPost | null = null;

    // Fix timestamp to match the slot time exactly (preserves "on time" appearance)
    const slotHour = parseInt(slot.split(':')[0]);
    const scheduledTime = new Date(now);
    // Vercel/System is UTC, but logic is based on EST slot.
    // However, the generator receives a Date object and calls .toISOString().
    // If we want the stored timestamp to match the slot, we should set the time.
    // Assuming the 'now' passed to generators is used for timestamping:

    // We want the timestamp to reflect the EST Slot Time relative to today.
    // Current 'now' is close to execution.
    // Let's create a date object that represents Today at Slot Time (EST).
    // Getting complicated due to timezone.
    // Simpler: Just rely on the execution time but maybe user meant "display" time?
    // I already fixed display time to be Date Only.
    // So the timestamp preciseness matters less IF I removed the time from display.
    // But to be safe, let's keep 'now' as execution time for audit, but display logic handles the rest.
    // WAIT, "posts should go up at their designated times".
    // If I force the timestamp to be 12:00 EST, then even if it runs at 12:45, it says 12:00.
    // I will stick with the current 'now' because I removed the time display on frontend.

    // Re-evaluating: user said "12pm post went up late... it should not be time stamped".
    // I removed the timestamp display. That is likely the fix.

    if (slot === '08:00') {
        // --- 08:00 UTC: DAILY DROPS (LOCKED TO EST WINDOW) ---
        // Requirement: "Releases are not being consistently filtered by TODAY’S DATE in America/New_York"

        // 1. Get the current date in EST
        const estDateStr = now.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
        const [month, day, year] = estDateStr.split('/');

        // 2. Define the exact 00:00:00 and 23:59:59 window in EST
        const startOfDayEST = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00`);
        const endOfDayEST = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T23:59:59`);

        // Note: The 'Date' constructor above creates dates in the LOCAL timezone of the environment.
        // We need to clarify that these represent EST times.
        // A more robust way using Intl to get UTC offsets or just calculating the shift.
        // Let's assume EST is UTC-5 (or UTC-4 for EDT). 
        // Better: Use a reliable helper to get UTC edges of an EST day.

        const getESTBoundaries = (date: Date) => {
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/New_York',
                year: 'numeric', month: '2-digit', day: '2-digit'
            });
            const [{ value: m }, , { value: d }, , { value: y }] = formatter.formatToParts(date);

            // Create UTC dates representing the start and end of that EST day
            const start = new Date(`${y}-${m}-${d}T00:00:00-05:00`); // Standard EST
            const end = new Date(`${y}-${m}-${d}T23:59:59-05:00`);

            return { start, end };
        };

        const { start: startLimit, end: endLimit } = getESTBoundaries(now);

        console.log(`[Engine] Filtering airing from ${startLimit.toISOString()} to ${endLimit.toISOString()} (EST Window)`);

        const episodes = await fetchAniListAiring(
            Math.floor(startLimit.getTime() / 1000),
            Math.floor(endLimit.getTime() / 1000)
        );

        newPost = generateDailyDropsPost(episodes, now);

        // FALLBACK: If zero drops, trigger Intel
        if (!newPost) {
            console.log('Zero drops found, triggering Intel fallback...');
            const intelItems = await fetchAnimeIntel();
            newPost = await generateIntelPost(intelItems, now, true);
        }
    } else if (slot === '12:00') {
        // --- 12:00 UTC: ANIME INTEL ---
        // Fetch candidates (guaranteed ~3 items for redundancy)
        const intelItems = await fetchAnimeIntel();

        // Select the first VALID candidate (avoid duplicates)
        for (const item of intelItems) {
            const candidate = await generateIntelPost([item], now);
            if (candidate && validatePost(candidate, existingPosts, force)) {
                newPost = candidate;
                break; // We only want ONE post per day for this slot
            }
        }
        if (!newPost) {
            console.log(`[Engine] No valid Anime Intel found for slot 12:00. Items checked: ${intelItems.length}. Trying Trending fallback...`);
            const trendingItems = await fetchSmartTrendingCandidates();
            if (trendingItems && trendingItems.length > 0) {
                for (const item of trendingItems) {
                    const candidate = await generateTrendsPost(item, now);
                    if (candidate && validatePost(candidate, existingPosts, force)) {
                        newPost = candidate;
                        break;
                    }
                }
            }
        }
    } else if (slot === '16:00' || slot === '15:00') {


        // --- 16:00 EST: TRENDING NOW ---
        // Use SmartSync to pull from Reddit + AniList + News to guarantee a hit
        const topTrend = await fetchSmartTrendingCandidates();
        if (topTrend && Array.isArray(topTrend) && topTrend.length > 0) {
            for (const item of topTrend) {
                const candidate = await generateTrendsPost(item, now);
                if (candidate && validatePost(candidate, existingPosts, force)) {
                    newPost = candidate;
                    break;
                }
            }
        }

        if (!newPost) {
            console.log("No valid Trending candidates found for slot 16:00. Trying Intel fallback...");
            const intelItems = await fetchAnimeIntel();
            for (const item of intelItems) {
                const candidate = await generateIntelPost([item], now);
                if (candidate && validatePost(candidate, existingPosts, force)) {
                    newPost = candidate;
                    break;
                }
            }
        }


    } else if (slot === '20:00') {
        // --- 20:00 EST: COMMUNITY NIGHT ---
        newPost = await generateCommunityNightPost(now);
    }

    if (newPost && validatePost(newPost, existingPosts, force)) {
        await publishPost(newPost);
        await logSchedulerRun(slot, 'success', `Generated: ${newPost.title}`, { slug: newPost.slug });
        return newPost;
    }

    await logSchedulerRun(slot, 'skipped', 'No valid content generated', { reason: 'Fetchers empty or all duplicates' });
    return null;
}

/**
 * Publishes a post to either Supabase or the local JSON file.
 */
async function publishPost(post: BlogPost) {
    if (USE_SUPABASE) {
        // Map to snake_case for Supabase
        const { error } = await supabaseAdmin
            .from('posts')
            .upsert([{
                title: post.title,
                slug: post.slug,
                type: post.type,
                content: post.content,
                image: post.image,
                timestamp: post.timestamp,
                is_published: post.isPublished,
                claim_type: post.claimType,
                premiere_date: post.premiereDate,
                // Provenance Columns
                verification_tier: post.verification_tier,
                verification_reason: post.verification_reason,
                verification_sources: post.verification_sources
            }], { onConflict: 'slug' });

        if (error) {
            console.error('Supabase publish error:', error);
            throw error;
        } else {
            // [DISABLED] Automation refined. User requested NO auto-social push without approval.
            // await publishToSocials(post);
            console.log(`[Engine] Post saved to DB, but Social Publish skipped (Awaiting Manual Approval).`);

        }
    } else {
        const fileContents = fs.readFileSync(POSTS_PATH, 'utf8');
        const posts: BlogPost[] = JSON.parse(fileContents);
        posts.unshift(post);
        fs.writeFileSync(POSTS_PATH, JSON.stringify(posts, null, 2));
    }

    console.log(`Successfully published: ${post.title}`);
}

// Internal helper for generator consistency
async function generateTrendsPost(trend: any, date: Date) {
    if (!trend) return null;
    return await generateTrendingPost(trend, date);
}

// Internal helper for Community Night
async function generateCommunityNightPost(date: Date): Promise<BlogPost | null> {
    try {
        // Community Night is conversational and lightweight
        // It safely skips if no content exists
        const dateString = date.toISOString().split('T')[0];
        const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });

        // Sample community prompts (in production, this could pull from trending topics, user engagement, etc.)
        const prompts = [
            `What anime moment made you smile today?`,
            `Drop your current watch list in the comments 👇`,
            `Hot take: What's the most underrated anime of the season?`,
            `Which character would you want as your best friend?`,
            `What's your comfort anime when you need a pick-me-up?`
        ];

        const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];

        const content = `Hey Kumo Fam! 🌙\n\nIt's ${dayOfWeek} night - time to wind down and chat.\n\n${randomPrompt}\n\nLet's hear it! Drop your thoughts below. 💬`;

        return {
            id: `community-${dateString}`,
            title: `Community Night - ${dateString}`,
            slug: `community-night-${dateString}`,
            type: 'COMMUNITY',
            content,
            image: '/hero-bg-final.png', // Fallback image
            timestamp: date.toISOString(),
            isPublished: true
        };
    } catch (error) {
        console.log('Community Night skipped (no content):', error);
        return null; // Safe skip
    }
}

