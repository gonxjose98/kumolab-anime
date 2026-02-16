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
import { getSourceTier, calculateRelevanceScore, checkForDuplicate } from './utils';

const POSTS_PATH = path.join(process.cwd(), 'src/data/posts.json');
const USE_SUPABASE = process.env.NEXT_PUBLIC_USE_SUPABASE === 'true';

/**
 * Main engine function to run for a specific slot.
 * Now triggered by a single hourly cron (see vercel.json)
 */
export async function runBlogEngine(slot: '08:00' | '12:00' | '16:00' | '20:00' | '15:00' | 'hourly', force: boolean = false) {
    const now = new Date();
    // 1. Convert to EST for "Wall Clock" logic (Sticky Triggering)
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

    let newPost: BlogPost | null = null;
    let explicitSlot = slot;
    let telemetry: any = null;

    console.log(`[Engine] Running at ${now.toISOString()} | EST: ${estDateSlug} ${currentEstHour}:00 | Trigger: ${slot}`);

    // --- 1. DAILY DROPS (STICKY TRIGGER @ 8 AM EST OR LATER) ---
    // If it's 8 AM or later and we haven't posted today's drops, prioritize them.
    const isDailyDropsSlot = explicitSlot === '08:00' || (explicitSlot === 'hourly' && currentEstHour >= 8 && !hasDailyDropsToday);

    if (isDailyDropsSlot) {
        console.log(`[Engine] Slot identified as Daily Drops. (EST Hour: ${currentEstHour}, Already Posted: ${hasDailyDropsToday})`);

        // Create UTC dates representing the start and end of the current EST day
        // We use the already extracted y, m, d
        const startLimit = new Date(`${y}-${m}-${d}T00:00:00-05:00`);
        const endLimit = new Date(`${y}-${m}-${d}T23:59:59-05:00`);

        console.log(`[Engine] Filtering airing from ${startLimit.toISOString()} to ${endLimit.toISOString()} (EST Window)`);

        const episodes = await fetchAniListAiring(
            Math.floor(startLimit.getTime() / 1000),
            Math.floor(endLimit.getTime() / 1000)
        );

        // Pass the EST date string to ensure the post slug stays consistent with the EST day
        newPost = generateDailyDropsPost(episodes, now, estDateSlug);

        if (!newPost) {
            console.log('[Engine] Zero drops found for today. Skipping Daily Drops.');
            // We don't return here, we let it fall through to Dynamic Newsroom IF it was an hourly trigger
            // But if it was explicitly '08:00', we might want to stop? 
            // Better to allow Dynamic Newsroom as a fallback if no drops exist.
        }

    }

    // Only run Dynamic Newsroom if we didn't just generate a Daily Drops post
    if (!newPost) {
        // --- 2. DYNAMIC NEWSROOM ---
        console.log('[Engine] Running Dynamic Newsroom Logic...');

        // RATE LIMIT CHECK:
        // [TEMP] Disabled for testing (was 55 minutes)
        /*
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
        */

        // 1. Fetch All Candidates (Intel + Trending)
        const result = await fetchSmartTrendingCandidates();
        const candidates = result.candidates;
        telemetry = result.telemetry;

        const abortLogs: any[] = [];

        // 2. Filter & Prioritize (Newsroom Logic)
        const newPosts: BlogPost[] = [];
        for (const item of candidates) {
            // Check for explicit ABORTS identified by fetcher (Reality Checks)
            if (['STALE_CONFIRMATION_ABORT', 'STALE_OR_DUPLICATE_FACT'].includes(item.claimType)) {
                abortLogs.push({
                    anime: item.title,
                    event_type: item.claimType,
                    source: item.source || 'KumoLab SmartSync',
                    reason: `FETCHER_ABORT: ${item.claimType}`
                });
                continue;
            }

            const post = await (item.source === 'KumoLab SmartSync' ? generateTrendingPost(item, now) : generateIntelPost([item], now));

            if (!post) {
                // If generator returned null, it was an internal abort (e.g. missing visual)
                abortLogs.push({
                    anime: item.title,
                    event_type: item.claimType,
                    source: item.source || 'KumoLab SmartSync',
                    reason: 'GENERATOR_ABORT (Likely missing visual or strict rule)'
                });
                continue;
            }

            // VALIDATE
            const existingPostsForDup = await getPosts(true);
            // [TEMP] Using force: true to bypass deduplication and populate queue for testing
            if (await validatePost(post, [...existingPostsForDup, ...newPosts], true)) {
                // NEW: Manual Approval Logic
                if (USE_SUPABASE) {
                    const duplicateResult = await checkForDuplicate(post.title, supabaseAdmin);
                    if (duplicateResult === 'DECLINED') {
                        console.log(`[Engine] Skipping "${post.title}" - Already in declined_posts.`);
                        continue;
                    }

                    const sourceTier = await getSourceTier(item.source || 'Unknown', supabaseAdmin);
                    const relevanceScore = calculateRelevanceScore({ title: post.title, source_tier: sourceTier });

                    post.status = 'pending';
                    post.isPublished = false;
                    (post as any).source_tier = sourceTier;
                    (post as any).relevance_score = relevanceScore;
                    (post as any).is_duplicate = duplicateResult !== null;
                    (post as any).duplicate_of = typeof duplicateResult === 'number' ? duplicateResult : null;
                    (post as any).scraped_at = new Date().toISOString();
                    (post as any).source = item.source || 'Unknown';
                }

                newPosts.push(post);
                console.log(`[Engine] Added to pending queue: "${post.title}"`);

                if (newPosts.length >= 20) {
                    console.log('[Engine] Hit 20 post limit for this run.');
                    break;
                }
            } else {
                abortLogs.push({
                    anime: post.title,
                    event_type: post.claimType,
                    source: item.source || 'KumoLab SmartSync',
                    reason: 'VALIDATION_REJECT (Duplicate or Image Check)',
                    fingerprint: post.event_fingerprint
                });
            }
        }

        if (newPosts.length > 0) {
            for (const p of newPosts) {
                await publishPost(p);
            }
            await logSchedulerRun(slot, 'success', `Generated ${newPosts.length} pending posts.`, {
                count: newPosts.length,
                titles: newPosts.map(p => p.title)
            });
            return newPosts[0]; // Return the first one for compatibility
        }

        if (abortLogs.length > 0) {
            console.log(`[Engine] Aborted ${abortLogs.length} candidates. Logging top aborts.`);
            await logSchedulerRun(slot, 'skipped', `Aborted ${abortLogs.length} candidates`, { aborts: abortLogs.slice(0, 20) });
        }
    }

    if (newPost) {
        await publishPost(newPost);
        await logSchedulerRun(slot, 'success', `Generated: ${newPost.title}`, { slug: newPost.slug, fingerprint: newPost.event_fingerprint });
        return newPost;
    }

    console.log('[Engine] No valid/new content found this hour.');

    // ANOMALY DETECTION: If we found many items but they all got rejected, log a warning instead of a simple skip
    if (telemetry && telemetry.negativeKeywordsSkipped > 15 && telemetry.candidatesFound === 0) {
        await logSchedulerRun(slot, 'warning' as any, 'High Content Rejection Rate Detected', {
            reason: 'Excessive negative keyword filtering. Verify if rules are too strict.',
            telemetry
        });
    } else {
        await logSchedulerRun(slot, 'skipped', 'No new content', { reason: 'No candidates met criteria', telemetry });
    }
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
                is_published: post.status === 'published' || (post.isPublished && post.status !== 'pending' && post.status !== 'approved'),
                claim_type: post.claimType,
                premiere_date: post.premiereDate,
                event_fingerprint: post.event_fingerprint,
                truth_fingerprint: post.truth_fingerprint,
                anime_id: post.anime_id,
                season_label: post.season_label,
                // Provenance Columns
                verification_tier: post.verification_tier,
                verification_reason: post.verification_reason,
                verification_sources: post.verification_sources,
                // New Approval Columns
                status: post.status || 'published',
                source_tier: (post as any).source_tier || 3,
                relevance_score: (post as any).relevance_score || 0,
                is_duplicate: (post as any).is_duplicate || false,
                duplicate_of: (post as any).duplicate_of || null,
                scraped_at: (post as any).scraped_at || post.timestamp,
                source: (post as any).source || 'Unknown',
                background_image: post.background_image,
                image_settings: post.image_settings
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

    // --- REVALIDATION ---
    try {
        const { revalidatePath } = await import('next/cache');
        revalidatePath('/');
        revalidatePath('/blog');
        revalidatePath(`/blog/${post.slug}`);
    } catch (e) {
        console.warn('[Engine] Revalidation failed:', e);
    }

    console.log(`Successfully published: ${post.title}`);
}

/**
 * Checks for scheduled posts and publishes them.
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

            // Update status and is_published
            const { error: updateError } = await supabaseAdmin
                .from('posts')
                .update({
                    status: 'published',
                    is_published: true,
                    timestamp: now.toISOString() // Update timestamp to now for "Newness"
                })
                .eq('id', post.id);

            if (updateError) {
                console.error(`[Publisher] Failed to update post ${post.id}:`, updateError);
                continue;
            }

            // [OPTIONAL] Revalidate
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
            isPublished: true,
            status: 'published'
        };
    } catch (error) {
        console.log('Community Night skipped (no content):', error);
        return null; // Safe skip
    }
}

