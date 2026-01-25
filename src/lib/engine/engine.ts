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
export async function runBlogEngine(slot: '08:00' | '12:00' | '16:00' | '20:00' | '15:00' | 'hourly', force: boolean = false) {

    const now = new Date();
    // Vercel generally runs in UTC. Convert to EST for "Wall Clock" logic.
    // We need to know if it is 8 AM EST.
    const estTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const currentEstHour = estTime.getHours();

    const existingPosts = await getPosts();
    let newPost: BlogPost | null = null;
    let explicitSlot = slot;

    console.log(`[Engine] Running at ${now.toISOString()} (EST Hour: ${currentEstHour}). Trigger: ${slot}`);

    // --- 1. DAILY DROPS (MANDATORY @ 8 AM EST) ---
    // Even if triggered as 'hourly', if it is 8 AM, we force Daily Drops.
    // allow a window (7 AM - 9 AM) to be safe or strict 8? 
    // Scheduler is strict. If it runs at 8:00 EST, hour is 8.

    if (explicitSlot === '08:00' || (explicitSlot === 'hourly' && currentEstHour === 8)) {
        console.log('[Engine] Slot identified as Daily Drops (08:00 EST).');

        // --- 08:00 UTC: DAILY DROPS (LOCKED TO EST WINDOW) ---
        // 1. Get the current date in EST
        const estDateStr = now.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
        const [month, day, year] = estDateStr.split('/');

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

        // If Daily Drops already exists for today, we might skip or allow update?
        // validatePost will check distinct title.

        // FALLBACK: If zero drops, do NOT post. User wants this fixed anchor. 
        // If empty, it's better to be silent than spam.
        if (!newPost) {
            console.log('[Engine] Zero drops found for today. Skipping 8 AM slot.');
        }

    } else {
        // --- 2. DYNAMIC NEWSROOM (ALL OTHER HOURS) ---
        console.log('[Engine] Running Dynamic Newsroom Logic...');

        // RATE LIMIT CHECK:
        // Did we post anything in the last 60 minutes?
        if (existingPosts.length > 0) {
            const lastPost = existingPosts[0];
            const lastPostTime = new Date(lastPost.timestamp);
            const diffMinutes = (now.getTime() - lastPostTime.getTime()) / (1000 * 60);

            if (diffMinutes < 55 && !force) {
                console.log(`[Engine] Rate Limit Hit. Last post was ${Math.floor(diffMinutes)} mins ago. Skipping.`);
                await logSchedulerRun(slot, 'skipped', 'Rate Limit Hit', { lastPost: lastPost.title });
                return null;
            }
        }

        // 1. Fetch All Candidates (Intel + Trending)
        const candidates = await fetchSmartTrendingCandidates();

        // 2. Filter & Prioritize (Newsroom Logic)
        // We want: High Quality, Breaking, NOT Posted.
        for (const item of candidates) {
            // GENERATE CANDIDATE
            // We use generateTrendingPost as the generic wrapper now since it handles SmartItems
            // But if it came from purely INTEL source (RSS), it might have ClaimType.

            // Map to unified shape if needed or just use generateTrendingPost which effectively detects visual/trailer
            // Actually fetchSmartTrendingCandidates returns unified objects now.

            const post = await generateTrendingPost(item, now);

            if (post) {
                // VALIDATE
                // 1. Deduplication (Critical)
                if (validatePost(post, existingPosts, force)) {

                    // 2. QUALITY THRESHOLD (The "Editorial" Filter)
                    // If it is 'Generic News' or low score, maybe skip?
                    // For now, if fetchSmartTrendingCandidates returned it in Top 10, it's decent.
                    // But we want to ensure we don't post "fluff".

                    // Check US-Centric "Debut" logic strictly here if not caught by fetcher
                    if (post.title.includes("Debuts in") && !post.title.includes("US") && !post.title.includes("Global")) {
                        console.log(`[Engine] Rejecting non-US Debut title: ${post.title}`);
                        continue;
                    }

                    newPost = post;
                    break; // Found our 1 breaking story for this hour.
                }
            }
        }
    }

    if (newPost) {
        // Final Double-Check validation
        if (validatePost(newPost, existingPosts, force)) {
            await publishPost(newPost);
            await logSchedulerRun(slot, 'success', `Generated: ${newPost.title}`, { slug: newPost.slug });
            return newPost;
        }
    }

    console.log('[Engine] No valid/new content found this hour.');
    await logSchedulerRun(slot, 'skipped', 'No new content', { reason: 'No candidates met criteria' });
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

