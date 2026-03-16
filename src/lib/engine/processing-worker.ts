/**
 * Processing Worker v2
 * Runs every 60 minutes via Vercel cron.
 *
 * v2: proper 4-layer dedup, FIFO, improved anime extraction,
 *     1-retry for transient failures, structured logging
 */

import { supabaseAdmin } from '../supabase/admin';
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

function determineClaimType(title: string, content: string): string {
  const combined = (title + ' ' + content).toLowerCase();
  if (/trailer|pv|promotional video|teaser/.test(combined)) return 'TRAILER_DROP';
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
  return cleaned.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().replace(/\x00/g, '').substring(0, maxLength);
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

async function createPendingPost(candidate: ProcessingCandidate, score: ContentScore, enrichedData: any): Promise<{ success: boolean; error?: string; postId?: string }> {
  try {
    const now = new Date().toISOString();
    const slug = generateSlug(candidate.title);

    const post: Record<string, any> = {
      title: sanitizeString(candidate.title, 200),
      slug: `${slug}-${Date.now().toString(36)}`,
      type: 'INTEL',
      claim_type: enrichedData.claimType || 'OTHER',
      content: sanitizeString(candidate.content, 5000),
      excerpt: sanitizeString(candidate.content, 197) + '...',
      source_url: candidate.canonical_url || candidate.source_url || '',
      source: candidate.source_name || 'Unknown',
      source_tier: candidate.source_tier || 2,
      timestamp: now,
      scraped_at: candidate.detected_at || now,
    };

    const imageUrl = candidate.media_urls?.[0] || null;
    const hasImage = !!imageUrl && imageUrl !== '/images/placeholder-news.svg';
    post.image = imageUrl || '/images/placeholder-news.svg';
    post.needs_image = !hasImage;

    // Store translation metadata if applicable
    if (candidate.metadata?.was_translated) {
      post.original_title = candidate.metadata.original_title;
      post.original_content = candidate.metadata.original_content;
    }

    const isT1YouTube = candidate.source_tier === 1 && candidate.source_name?.toLowerCase().includes('youtube');

    // NO IMAGE = always force pending, regardless of score/tier
    if (!hasImage) {
      post.status = 'pending';
      post.is_published = false;
      await logScraperDecision({ candidateTitle: candidate.title, sourceName: candidate.source_name, sourceTier: candidate.source_tier, decision: 'accepted_pending', reason: `No image — requires manual review. Score ${score.total}`, score: score.total, scoreBreakdown: score.breakdown });
    } else if (isT1YouTube && score.total >= SCORING_THRESHOLDS.HIGH_CONFIDENCE) {
      // T1 auto-approved: schedule for next available slot, don't publish immediately
      const nextSlot = await getNextAvailableSlot();
      post.status = 'approved';
      post.is_published = false;
      post.approved_at = now;
      post.approved_by = 'system';
      post.scheduled_post_time = nextSlot.toISOString();
      await logScraperDecision({ candidateTitle: candidate.title, sourceName: candidate.source_name, sourceTier: candidate.source_tier, decision: 'accepted_auto', reason: `T1 YouTube high confidence — scheduled for ${nextSlot.toISOString()}`, score: score.total, scoreBreakdown: score.breakdown });
      await logAction({ action: 'auto_approved', entityTitle: candidate.title, actor: 'Scraper', reason: `T1 YouTube, score ${score.total}, scheduled ${nextSlot.toISOString()}` });
    } else {
      post.status = 'pending';
      post.is_published = false;
      await logScraperDecision({ candidateTitle: candidate.title, sourceName: candidate.source_name, sourceTier: candidate.source_tier, decision: 'accepted_pending', reason: `Score ${score.total}, ${score.confidence}`, score: score.total, scoreBreakdown: score.breakdown });
    }

    // Grade content quality before insertion
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
    post.quality_grade = gradeResult.grade;

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

async function markCandidateProcessed(candidateId: string, status: 'processed' | 'discarded', result: ProcessedResult) {
  const update: Record<string, any> = {
    status, processed_at: new Date().toISOString(), score: result.score.total,
    score_breakdown: result.score.breakdown, action_taken: result.action, duplicate_of: result.duplicateOf || null,
  };
  if (result.error) update.error_message = result.error;
  await supabaseAdmin.from('detection_candidates').update(update).eq('id', candidateId);
}

// ─── Main Worker ────────────────────────────────────────────

export async function runProcessingWorker(): Promise<{ processed: number; accepted: number; rejected: number; duplicates: number; errors: string[] }> {
  console.log('[ProcessingWorker] Starting processing cycle...');
  const startTime = Date.now();
  const stats = { processed: 0, accepted: 0, rejected: 0, duplicates: 0, errors: [] as string[] };

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

    for (const candidate of candidates) {
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
            candidate.metadata = {
              ...candidate.metadata,
              original_title: candidate.title,
              original_content: candidate.content,
              was_translated: true,
            };
            candidate.title = translated.title;
            candidate.content = translated.content;
          } catch (err: any) {
            // BLOCK: Do not create posts with Japanese text — reject the candidate
            console.error(`[ProcessingWorker] Translation FAILED for "${candidate.title}": ${err.message} — skipping`);
            await logScraperDecision({ candidateTitle: candidate.title, sourceName: candidate.source_name, sourceTier: candidate.source_tier, decision: 'rejected_error', reason: `Translation failed: ${err.message.substring(0, 60)}`, score: score.total });
            await markCandidateProcessed(candidate.id, 'discarded', {
              candidate, score, action: 'reject', error: `Translation failed: ${err.message}`,
              enrichedData: { animeName: undefined, claimType: 'OTHER' },
            });
            stats.rejected++;
            continue;
          }
        }

        // ─── Format title to KumoLab standard ──────────────
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
        const enrichedData = { animeName, claimType: determineClaimType(candidate.title, candidate.content), studio: candidate.source_name?.includes('YouTube') ? candidate.metadata?.channel_name : undefined };

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

        await markCandidateProcessed(candidate.id, result.action === 'accept' ? 'processed' : 'discarded', result);
      } catch (error: any) {
        stats.errors.push(`${candidate.id}: ${error.message}`);
        await logError({ source: 'processing-worker', errorMessage: error.message, context: { candidateId: candidate.id } });
        await markCandidateProcessed(candidate.id, 'discarded', {
          candidate, score: { total: 0, breakdown: { sourceAuthority: 0, contentType: 0, visualEvidence: 0, temporalRelevance: 0 }, confidence: 'low', publishThreshold: false },
          action: 'reject', error: error.message,
        });
      }
    }

    const duration = Date.now() - startTime;
    await logSchedulerRun('processing', 'success', `${stats.accepted} accepted, ${stats.rejected} rejected, ${stats.duplicates} dups`, stats);
    await logAgentAction({ agentName: 'Scraper', action: 'completed processing cycle', details: `${stats.accepted}/${stats.rejected}/${stats.duplicates} in ${duration}ms` });
    console.log(`[ProcessingWorker] Complete in ${duration}ms:`, stats);
  } catch (error: any) {
    stats.errors.push(error.message);
    await logSchedulerRun('processing', 'error', error.message, { error: error.message });
    await logError({ source: 'processing-worker', errorMessage: error.message, stackTrace: error.stack });
  }

  return stats;
}

if (require.main === module) {
  runProcessingWorker().then(result => {
    console.log('Result:', result);
    process.exit(result.errors.length > 0 && result.processed === 0 ? 1 : 0);
  }).catch(error => { console.error('Failed:', error); process.exit(1); });
}
