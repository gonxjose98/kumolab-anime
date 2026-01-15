/**
 * engine.ts
 * Orchestrator for the KumoLab Daily Blog Automation
 */

import { fetchAniListAiring, verifyOnCrunchyroll, fetchAnimeIntel, fetchTrendingSignals } from './fetchers';
import { generateDailyDropsPost, generateIntelPost, generateTrendingPost, validatePost } from './generator';
import { getPosts } from '../blog';
import { BlogPost } from '@/types';
import fs from 'fs';
import path from 'path';

import { supabase } from '../supabase/client';

const POSTS_PATH = path.join(process.cwd(), 'src/data/posts.json');
const USE_SUPABASE = process.env.NEXT_PUBLIC_USE_SUPABASE === 'true';

/**
 * Main engine function to run for a specific slot.
 * Now triggered by a single hourly cron (see vercel.json)
 */
export async function runBlogEngine(slot: '08:00' | '12:00' | '15:00' | '20:00') {
    const now = new Date();
    const existingPosts = await getPosts();
    let newPost: BlogPost | null = null;

    if (slot === '08:00') {
        // --- 08:00 UTC: DAILY DROPS ---
        const startOfDay = new Date(now);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(now);
        endOfDay.setUTCHours(23, 59, 59, 999);

        const episodes = await fetchAniListAiring(
            Math.floor(startOfDay.getTime() / 1000),
            Math.floor(endOfDay.getTime() / 1000)
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
        const intelItems = await fetchAnimeIntel();
        newPost = await generateIntelPost(intelItems, now);
    } else if (slot === '15:00') {
        // --- 15:00 UTC: TRENDING NOW ---
        const signals = await fetchTrendingSignals();
        const topTrend = signals[0];
        newPost = await generateTrendsPost(topTrend, now);
    } else if (slot === '20:00') {
        // --- 20:00 EST: COMMUNITY NIGHT ---
        newPost = await generateCommunityNightPost(now);
    }

    if (newPost && validatePost(newPost, existingPosts)) {
        await publishPost(newPost);
        return newPost;
    }

    return null;
}

/**
 * Publishes a post to either Supabase or the local JSON file.
 */
async function publishPost(post: BlogPost) {
    if (USE_SUPABASE) {
        // Map to snake_case for Supabase
        const { error } = await supabase
            .from('posts')
            .insert([{
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
            }]);

        if (error) {
            console.error('Supabase publish error:', error);
            throw error;
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

        const content = `Hey Kumo Fam! 🌙\n\nIt's ${dayOfWeek} night — time to wind down and chat.\n\n${randomPrompt}\n\nLet's hear it! Drop your thoughts below. 💬`;

        return {
            id: `community-${dateString}`,
            title: `Community Night — ${dateString}`,
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

