/**
 * Processing Worker v2
 * Runs every 60 minutes via Vercel cron.
 *
 * v2: proper 4-layer dedup, FIFO, improved anime extraction,
 *     1-retry for transient failures, structured logging
 */

import { supabaseAdmin } from '../supabase/admin';
import { randomUUID } from 'crypto';
import {
  SCORING_WEIGHTS,
  SCORING_PENALTIES,
  SCORING_THRESHOLDS,
  type ContentScore
} from './intelligence-config';
import { logSchedulerRun } from '../logging/scheduler';
import { logScraperDecision, logAction, logError, logAgentAction } from '../logging/structured-logger';
import { detectDuplicate } from './duplicate-prevention';
import { gradeContent } from './content-grader';
import { AntigravityAI } from './ai';
import { decideAutoApproval } from './auto-approval';
import { runSlotSelection, assignFbOnlySlot } from './scheduler';
import { scorePost } from './scoring';
import { getAnimeTierForTitle } from './anime-tiers';
import { evaluateCircuitBreaker } from './circuit-breaker';
import { extractYouTubeVideo } from './video-extractor';
import { isTrailerTrustedSource } from './automation-config';
import { selectBestImage } from './image-selector';
import { stripFancyDashes } from './utils';

// Branded fallback URL returned by selectBestImage when nothing usable is
// found — we treat that as "no image" since it's not actual anime artwork.
const KUMOLAB_BRAND_FALLBACK = '/hero-bg-final.png';

// ─── Japanese Detection ────────────────────────────────────────

function containsJapanese(text: string): boolean {
  if (!text) return false;
  const stripped = text.replace(/\s+/g, '');
  if (stripped.length === 0) return false;
  // Create fresh regex each call to avoid lastIndex state issues with /g flag
  const cjkCount = (stripped.match(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\uff00-\uff9f]/g) || []).length;
  return cjkCount / stripped.length > 0.2;
}

interface ProcessingCandidate {
  id: string;
  source_name: string;
  source_tier: 1 | 2 | 3;
  source_url: string;
  title: string;
  content: string;
  detected_at: string;
  original_timestamp?: string;
  media_urls: string[];
  canonical_url?: string;
  fingerprint: string;
  metadata?: Record<string, any>;
  error_message?: string;
}

interface ProcessedResult {
  candidate: ProcessingCandidate;
  score: ContentScore;
  action: 'accept' | 'reject' | 'duplicate';
  duplicateOf?: string;
  enrichedData?: { animeName?: string; claimType?: string; studio?: string };
  error?: string;
}

// ─── Content Scoring ────────────────────────────────────────

function calculateContentScore(candidate: ProcessingCandidate): ContentScore {
  const breakdown = { sourceAuthority: 0, contentType: 0, visualEvidence: 0, temporalRelevance: 0 };
  const combined = (candidate.title + ' ' + candidate.content).toLowerCase();

  if (candidate.source_tier === 1) breakdown.sourceAuthority = SCORING_WEIGHTS.OFFICIAL_STUDIO_SOURCE;
  else if (candidate.source_tier === 2) {
    breakdown.sourceAuthority = /kadokawa|aniplex|toho|shueisha|bandai|pony canyon/.test(combined)
      ? SCORING_WEIGHTS.PUBLISHER_CONFIRMATION : SCORING_WEIGHTS.NEWS_DISTRIBUTOR;
  } else breakdown.sourceAuthority = SCORING_WEIGHTS.SIGNAL_DETECTION;

  if (/trailer|pv\s|teaser|promotional video/.test(combined)) breakdown.contentType = SCORING_WEIGHTS.TRAILER_VIDEO;
  else if (/season\s*\d+|\d+nd season|\d+rd season|\d+th season|new season|sequel/.test(combined)) breakdown.contentType = SCORING_WEIGHTS.SEASON_CONFIRMATION;
  else if (/key visual|visual revealed|new visual|main visual/.test(combined)) breakdown.contentType = SCORING_WEIGHTS.KEY_VISUAL;
  else if (/release date|premiere|airing|broadcast|debut/.test(combined)) breakdown.contentType = SCORING_WEIGHTS.RELEASE_DATE;
  else if (/cast|staff|director|voice actor|seiyuu/.test(combined)) breakdown.contentType = SCORING_WEIGHTS.CAST_STAFF_UPDATE;
  else if (/production|in production|greenlit|announced/.test(combined)) breakdown.contentType = SCORING_WEIGHTS.PRODUCTION_NEWS;

  if (candidate.media_urls?.length > 0) {
    breakdown.visualEvidence = /key visual|main visual/.test(combined) ? SCORING_WEIGHTS.KEY_VISUAL_IMAGE : SCORING_WEIGHTS.OFFICIAL_IMAGE;
  }

  // Video bonus: YouTube sources with actual video content get +2
  const isYouTube = candidate.source_name?.toLowerCase().includes('youtube');
  if (isYouTube) {
    breakdown.visualEvidence += 2;
  }

  if (candidate.original_timestamp) {
    const hours = (Date.now() - new Date(candidate.original_timestamp).getTime()) / 3600000;
    if (hours <= 1) breakdown.temporalRelevance = SCORING_WEIGHTS.BREAKING_WITHIN_HOUR;
    else if (hours <= 24) breakdown.temporalRelevance = SCORING_WEIGHTS.RECENT_WITHIN_DAY;
  }

  let penalties = 0;
  if (/merchandise|merch|goods only|figure|toy|nendoroid|figma/.test(combined)) penalties += SCORING_PENALTIES.MERCHANDISE_ONLY;
  if (/\bfigure\b|\bfigurine\b|\bstatue\b|\bcollectible/.test(combined)) penalties += SCORING_PENALTIES.FIGURES_TOYS;
  if (/rumor|speculation|reportedly|allegedly|might|could|possibly/.test(combined)) penalties += SCORING_PENALTIES.FAN_SPECULATION;
  if (/\bgame\b(?!.*\banime\b).*\bannouncement\b/.test(combined)) penalties += SCORING_PENALTIES.OFF_TOPIC;
  if (/\bcosplay\b/.test(combined)) penalties += SCORING_PENALTIES.OFF_TOPIC;
  if (/\breview\b|\bopinion\b|\branking\b|\btop\s*\d+\b|\bbest anime\b/.test(combined)) penalties += SCORING_PENALTIES.OFF_TOPIC;

  const total = breakdown.sourceAuthority + breakdown.contentType + breakdown.visualEvidence + breakdown.temporalRelevance + penalties;
  const confidence: 'high' | 'medium' | 'low' = total >= SCORING_THRESHOLDS.HIGH_CONFIDENCE ? 'high' : total >= SCORING_THRESHOLDS.PUBLISH_MINIMUM ? 'medium' : 'low';

  return { total, breakdown, confidence, publishThreshold: total >= SCORING_THRESHOLDS.PUBLISH_MINIMUM };
}

// ─── Improved Anime Name Extraction (12+ patterns) ──────────

function extractAnimeName(title: string, content: string): string | undefined {
  const patterns = [
    /^(.+?)\s+(?:Season|Movie|Film|Anime|Part)\s*\d/i,
    /^(?:New|Latest|Official)\s+(.+?)\s+(?:Trailer|PV|Teaser|Visual|Key Visual|Announced)/i,
    /^(?:Trailer|PV|Teaser|Visual)\s+(?:for|of)\s+(.+?)(?:\s+Released|$)/i,
    /^(.+?)\s+(?:Announces|Reveals|Confirms|Gets|Receives)/i,
    /(?:MAPPA|Ufotable|A-1 Pictures|CloverWorks|Trigger|Bones|Madhouse|WIT Studio|Production I\.G|Toei)\s+(?:Reveals?|Announces?|Confirms?)\s+(.+?)(?:\s+(?:Season|Key Visual|Trailer|PV|Release|Premiere))/i,
    /['"](.+?)['"]\s+(?:Season|Movie|Film|Part|Gets|Receives|Anime)/i,
    /^(.+?)\s+Anime\s+(?:Season|Movie|Film|Part)/i,
    /(?:TV Anime|Anime)\s+['"]?(.+?)['"]?\s+(?:Season|Movie|Reveals|Announces|Gets|Receives|New|PV|Trailer)/i,
    /['"]([^'"]{3,40})['"]/,
    /^(.+?)\s*(?:[-–—:|])\s+/,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1]) {
      const name = match[1].trim();
      if (name.length >= 2 && !/^(new|the|a|an|this|that|more|first|latest|official)$/i.test(name)) return name;
    }
  }
  return undefined;
}

/**
 * Deterministic title scrub before the AI formatter sees it. Strips channel
 * suffixes, leading garbage, and de-shouts ALL-CAPS chunks so the formatter
 * has clean material instead of "Magic High in 3 Minutes" -SEASON 3 DOUBLE
 * SEVEN ARC" style noise.
 */
function preCleanTitle(raw: string): string {
  if (!raw) return raw;
  let t = raw;

  // Strip trailing channel/source suffixes that show up on YouTube uploads
  // ("X | Crunchyroll", "X | Aniplex USA", "X | TOHO animation", etc.)
  t = t.replace(/\s*\|\s*(crunchyroll(?:\s+dubs)?|aniplex(?:\s+usa)?|toho(?:\s+animation)?|netflix(?:\s+anime)?|kadokawa(?:anime)?|mappa(?:\s+(?:official|channel))?|cloverworks|a-?1\s+pictures(?:\s+channel)?|viz\s*media|pony\s*canyon|funimation|hidive)\s*$/i, '');

  // Drop common bracketed/parenthesized noise: [SUB], [DUB], [ANIME], (Sub), (Official), etc.
  t = t.replace(/\s*[\[\(]\s*(sub|dub|subtitled|dubbed|english|en|jp|japanese|official|anime|spoiler|spoilers?free)\s*[\]\)]\s*/gi, ' ');

  // Strip leading "RE-", "PV-", "FULL-", "WATCH-" style prefixes joined by hyphens
  t = t.replace(/^\s*(re|pv|cm|full|watch|new|exclusive)[\s-]+(?=[A-Z0-9])/i, '');

  // Hyphen glued to ALL-CAPS chunk: "X -SEASON 3" -> "X • Season 3".
  // House separator is the bullet, never an em dash (no em/en dashes anywhere).
  t = t.replace(/\s+-([A-Z][A-Z0-9 ]{2,})/g, ' • $1');

  // Strip wrapping straight/smart quotes around the whole thing
  t = t.replace(/^["'""'']\s*|\s*["'""'']$/g, '').trim();

  // De-shout: only multi-word ALL-CAPS runs ("SEASON 3 DOUBLE SEVEN ARC",
  // "FINAL ARC TRAILER") → Title Case. Single-word ALL-CAPS is preserved
  // so legitimate acronyms (TYBW, OVA, OP, ED, S2, MAPPA) survive. Allows
  // digits as second-and-later words ("SEASON 3").
  t = t.replace(/\b[A-Z][A-Z0-9]+(?:\s+[A-Z0-9][A-Z0-9]*)+\b/g, (chunk) => {
    return chunk.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  });

  // Collapse repeated whitespace + trailing punctuation noise
  t = t.replace(/\s{2,}/g, ' ').replace(/[\s—–-]+$/g, '').trim();

  return t || raw;
}

function determineClaimType(title: string, content: string, sourceName?: string): string {
  const combined = (title + ' ' + content).toLowerCase();
  // Only allow TRAILER_DROP from sources where the extractor can actually surface
  // the video (YouTube channel RSS, or article HTML with raw embeds — see
  // isTrailerTrustedSource). For everyone else, "trailer" in the headline is a
  // news article *about* a trailer, not the trailer itself; let it fall through
  // to the next-best claim (season / visual / date).
  if (/trailer|pv|promotional video|teaser/.test(combined) && isTrailerTrustedSource(sourceName)) return 'TRAILER_DROP';
  if (/season\s*\d+|new season|sequel|2nd season|3rd season/.test(combined)) return 'NEW_SEASON_CONFIRMED';
  if (/key visual|main visual|visual revealed/.test(combined)) return 'NEW_KEY_VISUAL';
  if (/release date|premiere date|air date/.test(combined)) return 'DATE_ANNOUNCED';
  if (/delay|postpone|reschedule|pushed back/.test(combined)) return 'DELAY';
  if (/cast|voice actor|seiyuu|staff|director/.test(combined)) return 'CAST_ADDITION';
  return 'OTHER';
}

function generateSlug(title: string): string {
  return title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').substring(0, 80);
}

function sanitizeString(str: string | null | undefined, maxLength = 200): string {
  if (!str) return '';
  let cleaned = str;
  for (let i = 0; i < 2; i++) {
    cleaned = cleaned.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)));
  }
  // stripFancyDashes enforces the no-em/en-dash brand rule on every title,
  // excerpt and content string before it is persisted (this is the chokepoint
  // all three pass through in createPendingPost).
  return stripFancyDashes(
    cleaned.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().replace(/\x00/g, '')
  ).substring(0, maxLength);
}

// ─── Staggered Scheduling ───────────────────────────────────
// Find the next available hourly slot that doesn't already have a scheduled post.
// Posts are spread at least 1 hour apart within the active window (8 AM – 10 PM EST).

async function getNextAvailableSlot(): Promise<Date> {
  const now = new Date();
  // Convert to EST
  const estOffset = -5; // EST (not daylight saving aware — adjust if needed)
  const estNow = new Date(now.getTime() + (now.getTimezoneOffset() + estOffset * 60) * 60000);

  // Active publishing window: 8 AM – 10 PM EST
  const WINDOW_START = 8;
  const WINDOW_END = 22;

  // Get all currently scheduled posts for the next 3 days
  const threeDaysOut = new Date(now);
  threeDaysOut.setDate(threeDaysOut.getDate() + 3);

  const { data: scheduled } = await supabaseAdmin
    .from('posts')
    .select('scheduled_post_time')
    .eq('status', 'approved')
    .not('scheduled_post_time', 'is', null)
    .gte('scheduled_post_time', now.toISOString())
    .lte('scheduled_post_time', threeDaysOut.toISOString());

  const takenHours = new Set(
    (scheduled || []).map(p => {
      const d = new Date(p.scheduled_post_time);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
    })
  );

  // Start from the next full hour
  const candidate = new Date(now);
  candidate.setMinutes(0, 0, 0);
  candidate.setHours(candidate.getHours() + 1);

  // Search up to 72 hours ahead
  for (let i = 0; i < 72; i++) {
    const estHour = new Date(candidate.getTime() + (candidate.getTimezoneOffset() + estOffset * 60) * 60000).getHours();
    const key = `${candidate.getFullYear()}-${candidate.getMonth()}-${candidate.getDate()}-${candidate.getHours()}`;

    if (estHour >= WINDOW_START && estHour < WINDOW_END && !takenHours.has(key)) {
      return candidate;
    }
    candidate.setHours(candidate.getHours() + 1);
  }

  // Fallback: next day 8 AM EST
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(WINDOW_START - estOffset, 0, 0, 0);
  return fallback;
}

// ─── Create Post ────────────────────────────────────────────

async function createPendingPost(candidate: ProcessingCandidate, score: ContentScore, enrichedData: any): Promise<{ success: boolean; error?: string; postId?: string; policyReject?: boolean }> {
  try {
    const now = new Date().toISOString();
    const slug = generateSlug(candidate.title);

    // KumoLab-voice caption (replaces the old truncated-RSS-dump excerpt). If
    // the AI is down we fall back to a sanitized truncation, so the post still
    // has *something* readable — but the brand voice is the default.
    let caption: string;
    try {
      caption = await AntigravityAI.getInstance().generateCaption({
        title: candidate.title,
        content: candidate.content,
        claim_type: enrichedData.claimType || 'OTHER',
        source: candidate.source_name,
      });
    } catch (err: any) {
      console.warn(`[ProcessingWorker] caption gen failed: ${err.message}`);
      caption = sanitizeString(candidate.content, 197) + '…';
    }

    const post: Record<string, any> = {
      title: sanitizeString(candidate.title, 200),
      slug: `${slug}-${Date.now().toString(36)}`,
      type: 'INTEL',
      claim_type: enrichedData.claimType || 'OTHER',
      anime_id: candidate.metadata?.anime_id ?? null,
      content: sanitizeString(candidate.content, 5000),
      excerpt: sanitizeString(caption, 200),
      source_url: candidate.canonical_url || candidate.source_url || '',
      source: candidate.source_name || 'Unknown',
      source_tier: candidate.source_tier || 2,
      timestamp: now,
    };

    let imageUrl = candidate.media_urls?.[0] || null;
    let hasImage = !!imageUrl && imageUrl !== '/images/placeholder-news.svg';

    // ── Image fallback chain ─────────────────────────────────
    // Non-video posts MUST ship with a real anime picture (Jose's rule). When
    // RSS gave us nothing, hit the visual-intelligence engine (AniList +
    // official-site OG + Reddit search) before giving up. selectBestImage
    // returns the branded /hero-bg-final.png when it can't find anything; we
    // treat that as "no image" so the artifact gate routes the post away.
    if (!hasImage && enrichedData.animeName) {
      try {
        const found = await selectBestImage(enrichedData.animeName, post.claim_type);
        if (found?.url && found.url !== KUMOLAB_BRAND_FALLBACK) {
          imageUrl = found.url;
          hasImage = true;
        }
      } catch (err: any) {
        console.warn(`[ProcessingWorker] selectBestImage failed for "${enrichedData.animeName}": ${err.message}`);
      }
    }

    post.image = imageUrl || '/images/placeholder-news.svg';

    const isT1YouTube = candidate.source_tier === 1 && !!candidate.source_name?.toLowerCase().includes('youtube');

    // ── Video extraction (always when source has a YouTube URL) ──
    // We extract for every claim type, not just TRAILER_DROP. A season
    // announcement / key visual reveal that happens to be a YouTube video
    // (like an Aniplex "3 Minutes" recap or a studio's season teaser) should
    // still embed the video on the blog post — otherwise we publish a
    // thumbnail-only post for content that's literally a video.
    //
    // hasVideo still gates the artifact rule: TRAILER_DROP claims require it,
    // other claims accept video as a bonus alongside an image.
    let hasVideo = false;
    {
      const video = await extractYouTubeVideo({
        source_url: candidate.source_url,
        canonical_url: candidate.canonical_url,
        content: candidate.content,
        title: candidate.title,
      });
      if (video) {
        post.youtube_video_id = video.youtube_video_id;
        post.youtube_url = video.youtube_url;
        post.youtube_embed_url = video.youtube_embed_url;
        // Use the YouTube thumbnail as the post image when we have nothing else.
        if (!hasImage) {
          post.image = `https://img.youtube.com/vi/${video.youtube_video_id}/maxresdefault.jpg`;
          hasImage = true;
        }
        hasVideo = true;
      }
    }

    // ── /100 scoring (ENGINE-SCORING-MODEL.md) ──────────────
    // Franchise demand comes from anime_tiers (title match first, tracked-
    // studio fallback second). Video quality is provisional here — the ffprobe
    // gate runs at publish-time fetch (trailer-fetcher) and hard-rejects
    // anything below 720p / 1.2 Mbps. The full breakdown is persisted on the
    // post row so the Engine tab popup renders it with no recompute, and the
    // standby selection re-scores recency from breakdown.meta.detected_at.
    const tierMatch = await getAnimeTierForTitle(post.title, enrichedData.studio || candidate.source_name || undefined);
    const postScore = scorePost({
      tier: tierMatch ? (tierMatch.tier as 1 | 2 | 3) : null,
      tierMatchedBy: tierMatch?.matchedBy ?? null,
      claimType: post.claim_type,
      format: hasVideo ? 'real_video' : 'static_image',
      detectedAt: candidate.original_timestamp || candidate.detected_at,
      videoQuality: null, // probe pending — measured in trailer-fetcher at publish
    });
    post.post_score = postScore.total;
    post.score_breakdown = postScore;

    // ── v2 decision pipeline ────────────────────────────────
    const decision = await decideAutoApproval({
      title: post.title,
      content: post.content,
      anime_id: candidate.metadata?.anime_id ?? null,
      claim_type: post.claim_type,
      source_tier: candidate.source_tier,
      source_name: candidate.source_name,
      postScore,
      hasImage,
      hasVideo,
      isT1YouTube,
    });

    if (decision.verdict === 'REJECT') {
      await logScraperDecision({
        candidateTitle: candidate.title,
        sourceName: candidate.source_name,
        sourceTier: candidate.source_tier,
        decision: 'rejected_policy',
        reason: decision.reason.substring(0, 200),
        score: score.total,
        scoreBreakdown: score.breakdown,
      });
      return { success: false, error: `POLICY_REJECT: ${decision.reason}`, policyReject: true };
    }

    if (decision.verdict === 'AUTO_APPROVE') {
      post.status = 'approved';
      post.is_published = false;
      post.approved_at = now;
      post.approved_by = 'system';

      if (decision.fbOnly) {
        // Facebook-only key visual: a SEPARATE product from the IG video reels.
        // It gets its own off-peak schedule (assignFbOnlySlot) and never enters
        // the IG peak-slot pool or counts toward the 3/day IG cap. The publisher
        // routes it to Facebook only (video-only-policy exception). Tag the
        // breakdown so the intent is legible in the Engine tab.
        postScore.meta.fb_only = true;
        post.score_breakdown = postScore;
        post.scheduled_post_time = await assignFbOnlySlot();
        await logScraperDecision({
          candidateTitle: candidate.title,
          sourceName: candidate.source_name,
          sourceTier: candidate.source_tier,
          decision: 'accepted_auto',
          reason: `FB-ONLY key visual (${postScore.total}/100, off-peak) | ${decision.reason}`.substring(0, 200),
          score: postScore.total,
          scoreBreakdown: { ...score.breakdown, post_score: postScore.total, fb_only: true, signals: decision.signals },
        });
        await logAction({
          action: 'auto_approved',
          entityTitle: candidate.title,
          actor: 'Scraper',
          reason: `Facebook-only key visual scheduled off-peak ${post.scheduled_post_time} (score ${postScore.total}/100)`,
        });
      } else {
        // Pool model (Jose 2026-07-17): auto-approved reels no longer claim a
        // slot on arrival. They join the scored pool (scheduled_post_time NULL);
        // runSlotSelection() — called at the end of this cycle and before every
        // publish tick — fills each of the 3 daily peak slots with the highest
        // CURRENT-scoring candidate, keeps 3 on standby, drops the aged/decayed.
        post.scheduled_post_time = null;
        await logScraperDecision({
          candidateTitle: candidate.title,
          sourceName: candidate.source_name,
          sourceTier: candidate.source_tier,
          decision: 'accepted_auto',
          reason: `POOLED (${postScore.total}/100) | ${decision.reason}`.substring(0, 200),
          score: postScore.total,
          scoreBreakdown: { ...score.breakdown, post_score: postScore.total, signals: decision.signals },
        });
        await logAction({
          action: 'auto_approved',
          entityTitle: candidate.title,
          actor: 'Scraper',
          reason: `pooled for peak-slot selection (score ${postScore.total}/100)`,
        });
      }
    } else {
      // QUEUE_FOR_REVIEW
      post.status = 'pending';
      post.is_published = false;
      await logScraperDecision({
        candidateTitle: candidate.title,
        sourceName: candidate.source_name,
        sourceTier: candidate.source_tier,
        decision: 'accepted_pending',
        reason: decision.reason.substring(0, 200),
        score: score.total,
        scoreBreakdown: { ...score.breakdown, signals: decision.signals },
      });
    }

    // Grade content quality for the scraper log only — quality_grade is not persisted on the post
    const gradeResult = gradeContent({
      source_tier: candidate.source_tier,
      source: candidate.source_name,
      image: post.image,
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      type: post.type,
      claim_type: post.claim_type,
      relevance_score: score.total,
      detected_at: candidate.detected_at,
    });

    const { data, error } = await supabaseAdmin.from('posts').insert([post]).select();
    if (error) {
      await logError({ source: 'processing-worker', errorMessage: `Insert: ${error.message}`, context: { title: post.title, code: error.code } });
      return { success: false, error: `DB: ${error.message}` };
    }
    if (!data?.length) return { success: false, error: 'No data returned' };

    await logAction({ action: 'created', entityType: 'post', entityId: data[0].id, entityTitle: post.title, actor: 'Scraper', reason: `Grade ${gradeResult.grade} (${gradeResult.score}/100), score ${score.total} from ${candidate.source_name}` });
    return { success: true, postId: data[0].id };
  } catch (error: any) {
    await logError({ source: 'processing-worker', errorMessage: error.message, context: { title: candidate.title } });
    return { success: false, error: `Exception: ${error.message}` };
  }
}

// Records the candidate's fingerprint in the permanent dedup memory and deletes
// the candidate row. Replaces the old "status-flag and keep forever" pattern — the
// detection_candidates table is now a true queue, not an archive.
async function finishCandidate(
  candidate: ProcessingCandidate,
  outcome: 'accepted' | 'rejected' | 'duplicate',
  claimType?: string
): Promise<void> {
  // Duplicates already have a fingerprint row — that's why they're flagged as dups.
  if (candidate.fingerprint && outcome !== 'duplicate') {
    await supabaseAdmin.from('seen_fingerprints').upsert({
      fingerprint: candidate.fingerprint,
      anime_id: candidate.metadata?.anime_id ?? null,
      claim_type: claimType ?? null,
      origin: outcome === 'accepted' ? 'processed' : 'declined',
      source_url: candidate.source_url,
      seen_at: new Date().toISOString(),
    }, { onConflict: 'fingerprint' });
  }
  await supabaseAdmin.from('detection_candidates').delete().eq('id', candidate.id);
}

// ─── Main Worker ────────────────────────────────────────────

// ─── Single-runner lock (worker_locks PK = lock_key) ──────────
// Vercel cron and the remote-agent backstop can both invoke the processing
// endpoint in the same window. Without a guard they'd grind the same FIFO
// candidates concurrently and could each insert a post for the same item.
//
// FAIL-OPEN BY DESIGN: this can only ever cause a SKIP when another run is
// genuinely in flight (Postgres unique_violation on the PK). Any other
// outcome — DB error, network blip, missing row — proceeds WITHOUT a lock,
// i.e. exactly the pre-lock behavior. A lock bug can never halt the pipeline.
const PROCESSING_LOCK_KEY = 'processing_worker_running';
// TTL > cycle budget (150s) and the function's 300s maxDuration, so a run
// that crashes without releasing self-heals: the row's expires_at lapses and
// the next cycle clears it before re-acquiring.
const PROCESSING_LOCK_TTL_MS = 300_000;

async function acquireProcessingLock(token: string): Promise<{ acquired: boolean; holding: boolean }> {
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + PROCESSING_LOCK_TTL_MS).toISOString();
  try {
    // Clear an expired lock first so a previously-crashed run can't block forever.
    await supabaseAdmin.from('worker_locks').delete().eq('lock_key', PROCESSING_LOCK_KEY).lt('expires_at', nowIso);
    // Atomic gate: the PK on lock_key makes a second concurrent insert fail.
    const { error } = await supabaseAdmin.from('worker_locks').insert({
      lock_key: PROCESSING_LOCK_KEY,
      locked_by: `processing:${token}`,
      locked_at: nowIso,
      expires_at: expiresAt,
    });
    if (!error) return { acquired: true, holding: true };
    if (error.code === '23505') return { acquired: false, holding: false }; // another fresh run holds it
    console.warn(`[ProcessingWorker] lock acquire error (${error.code}); proceeding without lock: ${error.message}`);
    return { acquired: true, holding: false }; // fail open
  } catch (e: any) {
    console.warn(`[ProcessingWorker] lock acquire threw; proceeding without lock: ${e?.message}`);
    return { acquired: true, holding: false }; // fail open
  }
}

async function releaseProcessingLock(token: string): Promise<void> {
  try {
    // Only ever delete OUR OWN lock row (match on token), never another run's.
    await supabaseAdmin.from('worker_locks').delete()
      .eq('lock_key', PROCESSING_LOCK_KEY)
      .eq('locked_by', `processing:${token}`);
  } catch (e: any) {
    // Non-fatal — expires_at guarantees the lock is reclaimable next cycle.
    console.warn(`[ProcessingWorker] lock release failed (will expire): ${e?.message}`);
  }
}

export async function runProcessingWorker(): Promise<{ processed: number; accepted: number; rejected: number; duplicates: number; deferred: number; errors: string[] }> {
  console.log('[ProcessingWorker] Starting processing cycle...');
  const startTime = Date.now();
  const stats = { processed: 0, accepted: 0, rejected: 0, duplicates: 0, deferred: 0, errors: [] as string[] };

  // Wall-clock budget for the candidate loop. Each candidate makes several
  // SEQUENTIAL AI calls (translate, title-format, caption, tone/safety), and
  // every AI call can walk the whole provider chain at up to 25s per provider
  // when the primary is slow/hung. So cycle time scales with candidate count
  // and degrades hard when AI is limping. Without a ceiling, a detection burst
  // (we've seen 22 at once) could run the function past Vercel's 300s
  // maxDuration and DROP candidates mid-flight. Instead, stop starting new
  // candidates once we're near the budget and let the rest ride to the next
  // hourly run — FIFO order is preserved and candidates aren't deleted until
  // processed, so nothing is lost. Default 150s leaves headroom under 300s for
  // publishScheduledPosts() (which runs before this in the cron route) plus one
  // in-flight candidate finishing after the check. Override via env.
  const CYCLE_BUDGET_MS = Number(process.env.KUMOLAB_PROCESSING_BUDGET_MS) || 150_000;

  // Claim the single-runner lock. acquireProcessingLock never throws and is
  // fail-open: !acquired means a concurrent run genuinely holds the lock.
  const lockToken = randomUUID();
  const lock = await acquireProcessingLock(lockToken);
  if (!lock.acquired) {
    console.warn('[ProcessingWorker] Another processing run holds the lock — skipping this cycle.');
    try {
      await logAgentAction({ agentName: 'Scraper', action: 'skipped processing cycle', details: 'another run already in progress' });
    } catch { /* noop — observability only */ }
    return stats;
  }

  try {

  // Circuit breaker check — evaluates correction velocity. If it trips, auto-publish pauses.
  try {
    const breaker = await evaluateCircuitBreaker();
    if (breaker.tripped) {
      console.warn(`[ProcessingWorker] CIRCUIT BREAKER TRIPPED: ${breaker.corrections} corrections in window`);
    }
  } catch (e: any) {
    console.warn('[ProcessingWorker] Circuit breaker eval failed:', e.message);
  }

  try {
    // FIFO: oldest first
    const { data: candidates, error } = await supabaseAdmin
      .from('detection_candidates')
      .select('*')
      .eq('status', 'pending_processing')
      .order('detected_at', { ascending: true })
      .limit(50);

    if (error) throw new Error(`Fetch candidates: ${error.message}`);
    if (!candidates?.length) { console.log('[ProcessingWorker] No candidates'); return stats; }

    console.log(`[ProcessingWorker] Processing ${candidates.length} candidates (FIFO)...`);

    for (const [idx, candidate] of candidates.entries()) {
      // Time-budget guard: stop starting new candidates if we're near the
      // ceiling. The remainder stays queued (pending_processing) for the next
      // hourly cycle — FIFO preserves order, so the oldest still go first.
      const elapsed = Date.now() - startTime;
      if (elapsed > CYCLE_BUDGET_MS) {
        stats.deferred = candidates.length - idx;
        console.warn(`[ProcessingWorker] Time budget ${CYCLE_BUDGET_MS}ms reached after ${elapsed}ms (${idx} processed); deferring ${stats.deferred} candidate(s) to next cycle`);
        break;
      }
      try {
        stats.processed++;
        const score = calculateContentScore(candidate);

        // ─── Auto-translate Japanese content ────────────────
        const needsTranslation = containsJapanese(candidate.title) || containsJapanese(candidate.content);
        if (needsTranslation) {
          try {
            const ai = AntigravityAI.getInstance();
            const translated = await ai.translateToEnglish(candidate.title, candidate.content);
            // Verify translation actually produced English
            if (containsJapanese(translated.title) || containsJapanese(translated.content)) {
              throw new Error('Translation output still contains Japanese');
            }
            console.log(`[ProcessingWorker] Translated: "${candidate.title}" → "${translated.title}"`);
            // Translate-once: replace in-memory fields and discard the source — no Japanese persistence
            candidate.title = translated.title;
            candidate.content = translated.content;
          } catch (err: any) {
            // BLOCK: Do not create posts with Japanese text — reject the candidate
            console.error(`[ProcessingWorker] Translation FAILED for "${candidate.title}": ${err.message} — skipping`);
            await logScraperDecision({ candidateTitle: candidate.title, sourceName: candidate.source_name, sourceTier: candidate.source_tier, decision: 'rejected_error', reason: `Translation failed: ${err.message.substring(0, 60)}`, score: score.total });
            await finishCandidate(candidate, 'rejected', 'OTHER');
            stats.rejected++;
            continue;
          }
        }

        // ─── Pre-clean + format title to KumoLab standard ──────────────
        // Pre-clean strips channel suffixes / quotes / bracketed noise / shouty
        // ALL-CAPS BEFORE the AI sees it, so the formatter doesn't have to
        // wrestle with "Title" -SEASON 3 DOUBLE SEVEN ARC" style cruft.
        candidate.title = preCleanTitle(candidate.title);
        try {
          const ai = AntigravityAI.getInstance();
          const formattedTitle = await ai.formatKumoLabTitle(candidate.title, candidate.content);
          if (formattedTitle && formattedTitle.length > 3) {
            candidate.title = formattedTitle;
          }
        } catch (err: any) {
          console.warn(`[ProcessingWorker] Title formatting failed: ${err.message}`);
          // Non-critical — continue with unformatted title
        }

        const animeName = extractAnimeName(candidate.title, candidate.content);
        const enrichedData = { animeName, claimType: determineClaimType(candidate.title, candidate.content, candidate.source_name), studio: candidate.source_name?.includes('YouTube') ? candidate.metadata?.channel_name : undefined };

        // ─── Post-translation negative-keyword recheck ─────────────────
        // The AI title formatter often introduces English phrases that
        // weren't in the source RSS / YouTube title (e.g. translates a
        // Japanese title and adds "Watch Party"). NEGATIVE_KEYWORDS were
        // already checked at scrape time, but the AI rewrite can sneak
        // banned phrases in. Re-check here, after the rewrite, before
        // we ever create a post row. Reuses the same source-of-truth list.
        const titleLower = (candidate.title || '').toLowerCase();
        const postFormatNegative = (await import('./sources-config')).CONTENT_RULES.NEGATIVE_KEYWORDS.find(kw =>
          titleLower.includes(kw.toLowerCase())
        );
        if (postFormatNegative) {
          await logScraperDecision({
            candidateTitle: candidate.title,
            sourceName: candidate.source_name,
            sourceTier: candidate.source_tier,
            decision: 'rejected_score',
            reason: `Post-AI-format negative keyword: ${postFormatNegative}`,
            score: score.total,
          });
          stats.rejected++;
          await supabaseAdmin.from('detection_candidates').delete().eq('id', candidate.id);
          continue;
        }

        // 4-layer dedup from duplicate-prevention.ts
        const dupResult = await detectDuplicate({
          title: candidate.title,
          event_fingerprint: candidate.metadata?.event_fingerprint,
          truth_fingerprint: candidate.metadata?.truth_fingerprint,
          anime_id: candidate.metadata?.anime_id,
          claimType: enrichedData.claimType as any,
          source: candidate.source_url,
        }, { checkWindow: 7, similarityThreshold: 0.65 });

        let result: ProcessedResult;

        if (dupResult.action === 'BLOCK') {
          result = { candidate, score, action: 'duplicate', duplicateOf: dupResult.duplicateOf || undefined, enrichedData };
          stats.duplicates++;
          await logScraperDecision({ candidateTitle: candidate.title, sourceName: candidate.source_name, sourceTier: candidate.source_tier, decision: 'rejected_duplicate', reason: dupResult.reason.substring(0, 80), score: score.total, duplicateOf: dupResult.duplicateOf || undefined });
        } else if (score.total < SCORING_THRESHOLDS.PUBLISH_MINIMUM) {
          result = { candidate, score, action: 'reject', enrichedData };
          stats.rejected++;
          await logScraperDecision({ candidateTitle: candidate.title, sourceName: candidate.source_name, sourceTier: candidate.source_tier, decision: 'rejected_score', reason: `Score ${score.total} < ${SCORING_THRESHOLDS.PUBLISH_MINIMUM}`, score: score.total, scoreBreakdown: score.breakdown });
        } else {
          const createResult = await createPendingPost(candidate, score, enrichedData);
          if (createResult.success) {
            result = { candidate, score, action: 'accept', enrichedData };
            stats.accepted++;
          } else if (createResult.policyReject) {
            // Decision engine rejected — don't retry, route straight to reject.
            result = { candidate, score, action: 'reject', enrichedData, error: createResult.error };
            stats.rejected++;
          } else {
            // Retry logic: 1 retry for transient failures (not "no image")
            const isRetryable = !createResult.error?.includes('No image');
            if (isRetryable && !candidate.error_message) {
              await supabaseAdmin.from('detection_candidates').update({ error_message: `Retry: ${createResult.error}` }).eq('id', candidate.id);
              await logScraperDecision({ candidateTitle: candidate.title, sourceName: candidate.source_name, decision: 'retry', reason: `Will retry: ${createResult.error?.substring(0, 40)}`, score: score.total });
              stats.processed--;
              continue;
            }
            result = { candidate, score, action: 'reject', enrichedData, error: createResult.error };
            stats.rejected++;
            if (!createResult.error?.includes('No image')) {
              await logScraperDecision({ candidateTitle: candidate.title, sourceName: candidate.source_name, decision: 'rejected_error', reason: createResult.error?.substring(0, 60) || 'Unknown', score: score.total });
            }
          }
        }

        const outcome: 'accepted' | 'rejected' | 'duplicate' =
          result.action === 'accept' ? 'accepted' :
          result.action === 'duplicate' ? 'duplicate' : 'rejected';
        await finishCandidate(candidate, outcome, enrichedData.claimType);
      } catch (error: any) {
        stats.errors.push(`${candidate.id}: ${error.message}`);
        await logError({ source: 'processing-worker', errorMessage: error.message, context: { candidateId: candidate.id } });
        await finishCandidate(candidate, 'rejected');
      }
    }

    // ── Peak-slot selection (standby-backfill) ─────────────────
    // Fresh auto-approvals just joined the pool; let them compete for the
    // upcoming peak slots right away (highest CURRENT score wins). Also runs
    // on every publish tick, so this is belt-and-braces, never load-bearing.
    try {
      const selection = await runSlotSelection();
      if (selection.filled || selection.dropped) {
        console.log(`[ProcessingWorker] Slot selection: ${selection.filled} filled, ${selection.standby} standby, ${selection.dropped} dropped`);
      }
    } catch (e: any) {
      console.warn('[ProcessingWorker] slot selection failed (non-fatal):', e?.message || e);
    }

    const duration = Date.now() - startTime;
    const deferNote = stats.deferred > 0 ? `, ${stats.deferred} deferred (budget)` : '';
    await logSchedulerRun('processing', 'success', `${stats.accepted} accepted, ${stats.rejected} rejected, ${stats.duplicates} dups${deferNote}`, stats);
    await logAgentAction({ agentName: 'Scraper', action: 'completed processing cycle', details: `${stats.accepted}/${stats.rejected}/${stats.duplicates} in ${duration}ms${deferNote}` });
    console.log(`[ProcessingWorker] Complete in ${duration}ms:`, stats);
  } catch (error: any) {
    stats.errors.push(error.message);
    await logSchedulerRun('processing', 'error', error.message, { error: error.message });
    await logError({ source: 'processing-worker', errorMessage: error.message, stackTrace: error.stack });
  }

  } finally {
    // Always release our own lock so the next cycle can run immediately
    // (rather than waiting for the TTL). No-op when we failed open.
    if (lock.holding) await releaseProcessingLock(lockToken);
  }

  return stats;
}

if (require.main === module) {
  runProcessingWorker().then(result => {
    console.log('Result:', result);
    process.exit(result.errors.length > 0 && result.processed === 0 ? 1 : 0);
  }).catch(error => { console.error('Failed:', error); process.exit(1); });
}
