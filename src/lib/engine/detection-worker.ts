/**
 * Detection Worker — UNIFIED PIPELINE (v2)
 * Single source of truth for all content ingestion.
 * Runs every 10 minutes via GitHub Actions.
 *
 * Scans: RSS feeds, YouTube (RSS — no API quota), Newsroom (AniList/MAL trending)
 * Output: detection_candidates table rows (pending_processing)
 *
 * v2 changes:
 * - Cross-references posts table to prevent re-detecting published content
 * - Persists source health to DB instead of in-memory
 * - YouTube uses RSS feeds (no API quota) + only scans 6 AM–9 PM EST
 * - Structured logging for every decision
 */

import { supabaseAdmin } from '../supabase/admin';
import {
  TIER_2_RSS_SOURCES,
  RELIABILITY_CONFIG,
} from './intelligence-config';
import { YOUTUBE_STUDIO_CHANNELS, CONTENT_RULES } from './sources-config';
import { logSchedulerRun } from '../logging/scheduler';
import { logScraperDecision, logError, logAgentAction } from '../logging/structured-logger';
import { createFingerprint } from './utils';

// RSS positive keyword filter — only accept RSS items matching these terms
const RSS_REQUIRED_KEYWORDS = [
  'trailer', 'teaser', 'pv',
  'announced', 'announces', 'announcement', 'confirmed', 'confirms', 'reveals', 'greenlit',
  'season 2', 'season 3', 'season 4', 'season 5', '2nd season', '3rd season', '4th season',
  'new season', 'final season', 'sequel', 'new anime',
  'key visual', 'new visual', 'main visual',
  'premiere', 'release date', 'broadcast date',
  'delay', 'postponed', 'rescheduled',
  'streaming', 'coming to',
];

// Candidate record interface
interface DetectionCandidate {
  source_name: string;
  source_tier: 1 | 2 | 3;
  source_url: string;
  title: string;
  content: string;
  detected_at: string;
  original_timestamp?: string;
  media_urls: string[];
  canonical_url?: string;
  extraction_method: 'RSS' | 'YouTube' | 'Nitter' | 'HTML';
  status: 'pending_processing';
  fingerprint?: string;
  metadata?: Record<string, any>;
}

// ─── Source Health (DB-backed) ──────────────────────────────

async function loadSourceHealth(sourceName: string): Promise<{ healthScore: number; consecutiveFailures: number; isEnabled: boolean }> {
  try {
    const { data } = await supabaseAdmin
      .from('source_health')
      .select('health_score, consecutive_failures, is_enabled, skipped_until')
      .eq('source_name', sourceName)
      .single();

    if (!data) return { healthScore: 100, consecutiveFailures: 0, isEnabled: true };

    // Check skip window — re-enable after expiry
    if (!data.is_enabled && data.skipped_until && new Date() > new Date(data.skipped_until)) {
      await supabaseAdmin.from('source_health').update({ is_enabled: true, skipped_until: null }).eq('source_name', sourceName);
      return { healthScore: data.health_score, consecutiveFailures: data.consecutive_failures, isEnabled: true };
    }

    return { healthScore: data.health_score, consecutiveFailures: data.consecutive_failures, isEnabled: data.is_enabled };
  } catch {
    return { healthScore: 100, consecutiveFailures: 0, isEnabled: true };
  }
}

async function updateSourceHealthDB(sourceName: string, sourceTier: number, success: boolean) {
  try {
    const existing = await loadSourceHealth(sourceName);
    const newHealth = success
      ? Math.min(100, existing.healthScore + RELIABILITY_CONFIG.HEALTH_RECOVERY)
      : Math.max(0, existing.healthScore - RELIABILITY_CONFIG.HEALTH_DECAY);
    const newFailures = success ? 0 : existing.consecutiveFailures + 1;
    const shouldDisable = newHealth < RELIABILITY_CONFIG.HEALTH_THRESHOLD;

    const update: Record<string, any> = {
      source_name: sourceName,
      source_type: 'rss',
      tier: sourceTier,
      health_score: newHealth,
      consecutive_failures: newFailures,
      is_enabled: !shouldDisable,
      last_check: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (success) update.last_success = new Date().toISOString();
    if (shouldDisable) {
      update.skipped_until = new Date(Date.now() + RELIABILITY_CONFIG.SKIP_DURATION_MINUTES * 60 * 1000).toISOString();
      console.log(`[DetectionWorker] Disabled ${sourceName} — health ${newHealth}`);
    }

    await supabaseAdmin.from('source_health').upsert(update, { onConflict: 'source_name' });
  } catch (e) {
    console.error(`[DetectionWorker] Failed to update health for ${sourceName}:`, e);
  }
}

// ─── RSS Fetch ──────────────────────────────────────────────

async function fetchRSSWithRetry(url: string, retries = 0): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, {
      headers: { 'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml', 'User-Agent': 'KumoLab-DetectionWorker/2.0' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch {
    if (retries < RELIABILITY_CONFIG.MAX_RETRIES) {
      const delay = Math.min(RELIABILITY_CONFIG.RETRY_DELAY_BASE * Math.pow(2, retries), RELIABILITY_CONFIG.RETRY_DELAY_MAX);
      await new Promise(r => setTimeout(r, delay));
      return fetchRSSWithRetry(url, retries + 1);
    }
    return null;
  }
}

// ─── RSS Parsing (supports RSS <item> + Atom <entry>) ───────

function parseRSSItems(xmlText: string, sourceName: string): DetectionCandidate[] {
  const candidates: DetectionCandidate[] = [];
  try {
    const itemRegex = /<item>[\s\S]*?<\/item>/g;
    const entryRegex = /<entry>[\s\S]*?<\/entry>/g;
    const items = xmlText.match(itemRegex) || xmlText.match(entryRegex) || [];

    for (const item of items.slice(0, 10)) {
      const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
      const linkMatch = item.match(/<link[^>]*href="([^"]+)"/) || item.match(/<link>(.*?)<\/link>/);
      const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/) || item.match(/<published>(.*?)<\/published>/) || item.match(/<updated>(.*?)<\/updated>/);
      const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) ||
                         item.match(/<summary>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/) ||
                         item.match(/<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content/);

      const title = titleMatch ? decodeHTMLEntities(titleMatch[1]) : '';
      const link = linkMatch ? linkMatch[1] : '';
      const pubDate = pubDateMatch ? pubDateMatch[1] : '';
      const description = descMatch ? decodeHTMLEntities(descMatch[1]) : '';

      if (!title || !link) continue;

      // Skip RSS items older than 24h — not breaking news
      if (pubDate) {
        const itemAge = Date.now() - new Date(pubDate).getTime();
        if (itemAge > 24 * 60 * 60 * 1000) continue;
      }

      // Require at least one positive keyword — filters out reviews, interviews, merch, opinion pieces
      const titleLower = title.toLowerCase();
      const descLower = description.toLowerCase();
      const hasPositiveKeyword = RSS_REQUIRED_KEYWORDS.some(kw =>
        titleLower.includes(kw.toLowerCase()) || descLower.includes(kw.toLowerCase())
      );
      if (!hasPositiveKeyword) continue;

      // Check negative keywords
      const hasNegative = CONTENT_RULES.NEGATIVE_KEYWORDS.some(kw =>
        titleLower.includes(kw.toLowerCase())
      );
      if (hasNegative) continue;

      const mediaUrls: string[] = [];
      const imgRegex = /<img[^>]+src="([^"]+)"/g;
      let imgMatch;
      while ((imgMatch = imgRegex.exec(item)) !== null) mediaUrls.push(imgMatch[1]);
      const enclosureMatch = item.match(/<enclosure[^>]+url="([^"]+)"/);
      if (enclosureMatch) mediaUrls.push(enclosureMatch[1]);
      const mediaMatch = item.match(/<media:content[^>]+url="([^"]+)"/);
      if (mediaMatch) mediaUrls.push(mediaMatch[1]);

      const fingerprint = createFingerprint(title, link);

      candidates.push({
        source_name: sourceName,
        source_tier: 2,
        source_url: link,
        title: title.substring(0, 200),
        content: stripHTML(description).substring(0, 1000),
        detected_at: new Date().toISOString(),
        original_timestamp: pubDate ? new Date(pubDate).toISOString() : undefined,
        media_urls: mediaUrls.slice(0, 5),
        canonical_url: link,
        extraction_method: 'RSS',
        status: 'pending_processing',
        fingerprint,
      });
    }
  } catch (error) {
    console.error(`[DetectionWorker] Error parsing RSS from ${sourceName}:`, error);
  }
  return candidates;
}

// ─── HTML Utils ─────────────────────────────────────────────

function decodeHTMLEntities(text: string): string {
  let cleaned = text;
  for (let i = 0; i < 2; i++) {
    cleaned = cleaned
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
      .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)));
  }
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');
  return cleaned.replace(/\s+/g, ' ').trim();
}

function stripHTML(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─── Anime Name Extraction (for semantic dedup) ─────────────

function extractAnimeNameFromTitle(title: string): string | null {
  const t = title.trim();
  const patterns = [
    /^(.+?)\s+(?:Season|Movie|Film|Anime|Part)\s*\d/i,
    /^(?:New|Latest|Official)\s+(.+?)\s+(?:Trailer|PV|Teaser|Visual|Key Visual|Announced)/i,
    /^(.+?)\s+(?:Announces?|Reveals?|Confirms?|Gets?|Receives?)/i,
    /(?:MAPPA|Ufotable|A-1 Pictures|CloverWorks|Trigger|Bones|Madhouse|WIT Studio|Production I\.G|Toei)\s+(?:Reveals?|Announces?|Confirms?)\s+(.+?)(?:\s+(?:Season|Key Visual|Trailer|PV|Release|Premiere))/i,
    /['"](.+?)['"]\s+(?:Season|Movie|Film|Part|Gets|Receives|Anime)/i,
    /(?:TV Anime|Anime)\s+['"]?(.+?)['"]?\s+(?:Season|Movie|Reveals|Announces|Gets|Receives|New|PV|Trailer)/i,
    /^(.+?)\s*(?:[-–—:|])\s+(?:Season|Trailer|PV|Teaser|Key Visual|Release|New|Official)/i,
  ];
  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match?.[1]) {
      const name = match[1].trim().replace(/[^\w\s]/g, '').toLowerCase();
      if (name.length >= 3 && !/^(new|the|a|an|this|that|more|first|latest|official|anime)$/i.test(name)) return name;
    }
  }
  return null;
}

function extractClaimTypeFromTitle(title: string): string | null {
  const t = title.toLowerCase();
  if (/trailer|pv|promotional video|teaser/.test(t)) return 'TRAILER';
  if (/season\s*\d+|new season|sequel|2nd season|3rd season|final season|returns for season/.test(t)) return 'SEASON';
  if (/key visual|main visual|visual revealed|new visual/.test(t)) return 'KEY_VISUAL';
  if (/release date|premiere|air date|broadcast/.test(t)) return 'RELEASE_DATE';
  if (/delay|postpone|reschedule/.test(t)) return 'DELAY';
  if (/cast|voice actor|seiyuu|staff|director/.test(t)) return 'CAST';
  if (/announce|confirm|greenlit|green-lit/.test(t)) return 'ANNOUNCEMENT';
  return null;
}

// ─── Duplicate Check (seen_fingerprints + candidates + posts) ─────────
// v2: declined_posts is gone — seen_fingerprints is the unified historical memory.

async function isDuplicateCandidate(fingerprint: string, url: string, title: string): Promise<{ isDup: boolean; reason?: string }> {
  // 1. Permanent fingerprint memory — covers every candidate ever processed/declined/published.
  const { data: fpMatch } = await supabaseAdmin
    .from('seen_fingerprints')
    .select('origin')
    .eq('fingerprint', fingerprint)
    .maybeSingle();

  if (fpMatch) {
    return { isDup: true, reason: `Fingerprint already seen (origin: ${fpMatch.origin})` };
  }

  // 2. In-flight check: same fingerprint currently in the queue
  const { data: candFPMatch } = await supabaseAdmin
    .from('detection_candidates')
    .select('id')
    .eq('fingerprint', fingerprint)
    .limit(1);

  if (candFPMatch && candFPMatch.length > 0) {
    return { isDup: true, reason: 'Fingerprint already in candidate queue' };
  }

  // 3. In-flight URL match
  if (url) {
    const { data: candUrlMatch } = await supabaseAdmin
      .from('detection_candidates')
      .select('id')
      .eq('source_url', url)
      .limit(1);

    if (candUrlMatch && candUrlMatch.length > 0) {
      return { isDup: true, reason: 'URL already in candidate queue' };
    }
  }

  // 4. Live post URL match — we already published this URL
  if (url) {
    const { data: postUrlMatch } = await supabaseAdmin
      .from('posts')
      .select('id')
      .eq('source_url', url)
      .limit(1);

    if (postUrlMatch && postUrlMatch.length > 0) {
      return { isDup: true, reason: 'URL already in posts' };
    }
  }

  // 5. Historical URL match in seen_fingerprints (declined/expired posts)
  if (url) {
    const { data: seenUrlMatch } = await supabaseAdmin
      .from('seen_fingerprints')
      .select('origin')
      .eq('source_url', url)
      .limit(1);

    if (seenUrlMatch && seenUrlMatch.length > 0) {
      return { isDup: true, reason: `URL previously seen (origin: ${seenUrlMatch[0].origin})` };
    }
  }

  // 6. Semantic anime + claim — catches rephrased reports of the same event.
  const animeName = extractAnimeNameFromTitle(title);
  const claimType = extractClaimTypeFromTitle(title);

  if (animeName && claimType) {
    // Live posts (7 day window)
    const { data: recentPosts } = await supabaseAdmin
      .from('posts')
      .select('id, title')
      .gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(200);

    for (const post of recentPosts || []) {
      if (!post.title) continue;
      const postAnime = extractAnimeNameFromTitle(post.title);
      const postClaim = extractClaimTypeFromTitle(post.title);
      if (postAnime && postClaim && postAnime === animeName && postClaim === claimType) {
        return { isDup: true, reason: `Same anime+claim: "${animeName}" ${claimType} (post ${post.id.slice(0, 8)})` };
      }
    }

    // Candidates in flight (no window — they're all <7 days by cleanup)
    const { data: recentCandidates } = await supabaseAdmin
      .from('detection_candidates')
      .select('id, title')
      .limit(200);

    for (const cand of recentCandidates || []) {
      if (!cand.title) continue;
      const candAnime = extractAnimeNameFromTitle(cand.title);
      const candClaim = extractClaimTypeFromTitle(cand.title);
      if (candAnime && candClaim && candAnime === animeName && candClaim === claimType) {
        return { isDup: true, reason: `Same anime+claim in candidate queue: "${animeName}" ${claimType}` };
      }
    }
  }

  // 7. Title-similarity Jaccard against live posts only (seen_fingerprints doesn't store titles)
  const { data: recentPostsForSim } = await supabaseAdmin
    .from('posts')
    .select('id, title')
    .gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .limit(100);

  if (recentPostsForSim && recentPostsForSim.length > 0) {
    const candidateWords = new Set(title.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    for (const entry of recentPostsForSim) {
      if (!entry.title) continue;
      const entryWords = new Set(entry.title.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2));
      const intersection = [...candidateWords].filter((w: string) => entryWords.has(w));
      const union = new Set([...candidateWords, ...entryWords]);
      const similarity = union.size > 0 ? intersection.length / union.size : 0;
      if (similarity >= 0.55) {
        return { isDup: true, reason: `Title similar (${Math.round(similarity * 100)}%) to post ${entry.id.slice(0, 8)}` };
      }
    }
  }

  return { isDup: false };
}

// ─── Content Importance Grading ─────────────────────────────

interface ContentGrade {
  score: number;       // 1-10 importance
  category: string;    // e.g., 'TRAILER', 'KEY_VISUAL', 'CAST', etc.
  label: string;       // human-readable label
}

function gradeVideoContent(title: string): ContentGrade {
  const t = title.toLowerCase();

  // Tier S (10): Full trailers, official PVs
  if (/\b(official\s+)?trailer\b|本予告|メインpv|main\s+pv/i.test(t))
    return { score: 10, category: 'TRAILER', label: 'Official Trailer' };
  if (/\bpv\b|予告|ティザー/i.test(t) && !/character|キャラ/i.test(t))
    return { score: 9, category: 'TRAILER', label: 'PV / Teaser' };

  // Tier A (8-9): Season announcements, teasers
  if (/season\s*\d|シーズン|sequel|続編|new\s+season|final\s+season/i.test(t))
    return { score: 9, category: 'SEASON_ANNOUNCEMENT', label: 'Season Announcement' };
  if (/teaser/i.test(t))
    return { score: 8, category: 'TEASER', label: 'Teaser' };

  // Tier B (7-8): Key visuals, release dates, opening/ending
  if (/key\s*visual|キービジュアル|new\s+visual|ビジュアル/i.test(t))
    return { score: 8, category: 'KEY_VISUAL', label: 'Key Visual' };
  if (/release\s+date|premiere|broadcast|放送|配信/i.test(t))
    return { score: 8, category: 'RELEASE_DATE', label: 'Release Date' };
  if (/opening|ending|op\s+theme|ed\s+theme|主題歌/i.test(t))
    return { score: 7, category: 'THEME_SONG', label: 'OP/ED Theme' };
  if (/announcement|announces|発表/i.test(t))
    return { score: 7, category: 'ANNOUNCEMENT', label: 'Announcement' };

  // Tier C (4-5): Cast, character reveals, CM
  if (/cast|キャスト|voice\s+actor|声優|character/i.test(t))
    return { score: 5, category: 'CAST', label: 'Cast/Character Reveal' };
  if (/\bcm\b|commercial|spot/i.test(t))
    return { score: 5, category: 'CM', label: 'CM/Spot' };
  if (/preview|次回予告/i.test(t))
    return { score: 4, category: 'PREVIEW', label: 'Episode Preview' };

  // Tier D (2-3): Episode clips, recaps
  if (/episode|エピソード|第\d+話/i.test(t))
    return { score: 3, category: 'EPISODE', label: 'Episode Content' };
  if (/anime/i.test(t))
    return { score: 3, category: 'GENERAL', label: 'Anime Content' };

  // Default: some relevance but low priority
  return { score: 1, category: 'OTHER', label: 'Other' };
}

// ─── YouTube via RSS — ALL channels, no API quota ───────────

async function scanYouTubeViaRSS(): Promise<DetectionCandidate[]> {
  // Only scan between 6 AM and 9 PM EST
  const estTimeStr = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false });
  const estHour = parseInt(estTimeStr);
  if (estHour < 6 || estHour >= 21) {
    console.log(`[DetectionWorker] YouTube skipped — outside active hours (${estHour} EST)`);
    return [];
  }

  const candidates: DetectionCandidate[] = [];

  // Combine ALL tiers from sources-config — ALL scanned via free RSS
  const allChannels = [
    ...YOUTUBE_STUDIO_CHANNELS.TIER_1.map(c => ({ ...c, tier: 1 as const })),
    ...YOUTUBE_STUDIO_CHANNELS.TIER_2.map(c => ({ ...c, tier: 2 as const })),
    ...YOUTUBE_STUDIO_CHANNELS.TIER_3.map(c => ({ ...c, tier: 3 as const })),
    ...YOUTUBE_STUDIO_CHANNELS.TIER_4.map(c => ({ ...c, tier: 3 as const })),
  ];

  console.log(`[DetectionWorker] Scanning ${allChannels.length} YouTube channels via RSS...`);

  // Scan all channels in parallel batches of 4 for speed
  const batchSize = 4;
  for (let i = 0; i < allChannels.length; i += batchSize) {
    const batch = allChannels.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map(channel => scanSingleYouTubeChannel(channel))
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        candidates.push(...result.value);
      }
    }
  }

  // Sort by content grade — most important first
  candidates.sort((a, b) => {
    const gradeA = (a.metadata?.content_grade as number) || 0;
    const gradeB = (b.metadata?.content_grade as number) || 0;
    return gradeB - gradeA;
  });

  return candidates;
}

async function scanSingleYouTubeChannel(channel: { name: string; channelId: string; tier: number }): Promise<DetectionCandidate[]> {
  const results: DetectionCandidate[] = [];

  try {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.channelId}`;
    const xml = await fetchRSSWithRetry(rssUrl);
    if (!xml) {
      await updateSourceHealthDB(`YouTube_${channel.name}`, channel.tier, false);
      return [];
    }

    await updateSourceHealthDB(`YouTube_${channel.name}`, channel.tier, true);

    const entryRegex = /<entry>[\s\S]*?<\/entry>/g;
    const entries = xml.match(entryRegex) || [];

    for (const entry of entries.slice(0, 5)) {
      const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
      const videoIdMatch = entry.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/);
      const publishedMatch = entry.match(/<published>([\s\S]*?)<\/published>/);

      const title = titleMatch ? titleMatch[1].trim() : '';
      const videoId = videoIdMatch ? videoIdMatch[1].trim() : '';
      if (!title || !videoId) continue;

      const publishedAt = publishedMatch ? publishedMatch[1].trim() : '';
      // Only videos from last 48 hours
      if (publishedAt && (Date.now() - new Date(publishedAt).getTime()) > 48 * 60 * 60 * 1000) continue;

      // Grade content importance
      const grade = gradeVideoContent(title);

      // For T1 channels: accept grade >= 5 (trailers, key visuals, major announcements)
      // For T2 channels: accept grade >= 6 (trailers, season announcements, key visuals)
      // For T3 channels: accept grade >= 8 (only trailers, key visuals, release dates)
      const minGrade = channel.tier === 1 ? 5 : channel.tier === 2 ? 6 : 8;
      if (grade.score < minGrade) {
        console.log(`[DetectionWorker] YouTube skip (grade ${grade.score}/${minGrade}): "${title}" [${channel.name}]`);
        continue;
      }

      // Check negative keywords
      const hasNegative = CONTENT_RULES.NEGATIVE_KEYWORDS.some(kw =>
        title.toLowerCase().includes(kw.toLowerCase())
      );
      if (hasNegative) continue;

      const fingerprint = createFingerprint(title, videoId);

      results.push({
        source_name: `YouTube_${channel.name}`,
        source_tier: channel.tier as 1 | 2 | 3,
        source_url: `https://youtube.com/watch?v=${videoId}`,
        title: title.substring(0, 200),
        content: `${grade.label} from ${channel.name}`,
        detected_at: new Date().toISOString(),
        original_timestamp: publishedAt || undefined,
        media_urls: [`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`],
        canonical_url: `https://youtube.com/watch?v=${videoId}`,
        extraction_method: 'YouTube',
        status: 'pending_processing',
        fingerprint,
        metadata: {
          video_id: videoId,
          channel_name: channel.name,
          channel_tier: channel.tier,
          content_grade: grade.score,
          content_category: grade.category,
          content_label: grade.label,
        },
      });
    }

    if (results.length > 0) {
      console.log(`[DetectionWorker] YouTube ${channel.name} (T${channel.tier}): ${results.length} videos [best: ${results[0]?.metadata?.content_label}]`);
    }
  } catch (error: any) {
    console.error(`[DetectionWorker] YouTube RSS error for ${channel.name}:`, error.message);
  }

  return results;
}

// ─── Save Candidates ────────────────────────────────────────

async function saveCandidates(candidates: DetectionCandidate[]): Promise<number> {
  let saved = 0;

  for (const candidate of candidates) {
    try {
      const dupCheck = await isDuplicateCandidate(candidate.fingerprint!, candidate.source_url, candidate.title);

      if (dupCheck.isDup) {
        await logScraperDecision({
          candidateTitle: candidate.title,
          sourceName: candidate.source_name,
          sourceTier: candidate.source_tier,
          sourceUrl: candidate.source_url,
          decision: 'rejected_duplicate',
          reason: dupCheck.reason || 'Dup at detection',
        });
        continue;
      }

      // detection_candidates uses `detected_at` (in candidate). The schema has no
      // `created_at` column on this table, so we must not spread one in.
      const { error } = await supabaseAdmin
        .from('detection_candidates')
        .insert([candidate]);

      if (error) {
        await logError({ source: 'detection-worker', errorMessage: `Insert failed: ${error.message}`, context: { title: candidate.title } });
      } else {
        saved++;
      }
    } catch (e: any) {
      await logError({ source: 'detection-worker', errorMessage: e.message, context: { title: candidate.title } });
    }
  }

  return saved;
}

// ─── Main Entry Point ───────────────────────────────────────

export async function runDetectionWorker(): Promise<{
  totalCandidates: number;
  newCandidates: number;
  sourcesChecked: number;
  errors: string[];
}> {
  console.log('[DetectionWorker] Starting detection cycle...');
  const startTime = Date.now();

  const allCandidates: DetectionCandidate[] = [];
  const errors: string[] = [];
  let sourcesChecked = 0;

  // 1. Scan RSS feeds (Tier 2)
  console.log('[DetectionWorker] Scanning RSS feeds...');
  for (const source of TIER_2_RSS_SOURCES) {
    const health = await loadSourceHealth(source.name);
    if (!health.isEnabled) {
      console.log(`[DetectionWorker] Skipping ${source.name} (disabled, health=${health.healthScore})`);
      continue;
    }

    sourcesChecked++;
    try {
      const xmlText = await fetchRSSWithRetry(source.url);
      if (xmlText) {
        const candidates = parseRSSItems(xmlText, source.name);
        allCandidates.push(...candidates);
        await updateSourceHealthDB(source.name, source.tier, true);
        console.log(`[DetectionWorker] ${source.name}: ${candidates.length} candidates`);
      } else {
        await updateSourceHealthDB(source.name, source.tier, false);
        errors.push(`${source.name}: Failed to fetch`);
        await logError({ source: 'detection-worker', errorMessage: `RSS fetch failed for ${source.name}`, context: { url: source.url } });
      }
    } catch (error: any) {
      await updateSourceHealthDB(source.name, source.tier, false);
      errors.push(`${source.name}: ${error.message}`);
      await logError({ source: 'detection-worker', errorMessage: error.message, context: { source: source.name } });
    }
  }

  // 2. Scan ALL YouTube channels via RSS (free, no quota) — 6 AM to 9 PM EST
  console.log('[DetectionWorker] Scanning YouTube (ALL channels via RSS)...');
  try {
    const youtubeCandidates = await scanYouTubeViaRSS();
    allCandidates.push(...youtubeCandidates);
    const channelCount = [
      ...YOUTUBE_STUDIO_CHANNELS.TIER_1,
      ...YOUTUBE_STUDIO_CHANNELS.TIER_2,
      ...YOUTUBE_STUDIO_CHANNELS.TIER_3,
      ...YOUTUBE_STUDIO_CHANNELS.TIER_4,
    ].length;
    sourcesChecked += channelCount;
    console.log(`[DetectionWorker] YouTube RSS: ${youtubeCandidates.length} candidates from ${channelCount} channels`);
  } catch (error: any) {
    errors.push(`YouTube RSS: ${error.message}`);
    await logError({ source: 'detection-worker', errorMessage: error.message, context: { module: 'youtube-rss' } });
  }

  // 3. Save candidates
  console.log(`[DetectionWorker] Saving ${allCandidates.length} candidates...`);
  const saved = await saveCandidates(allCandidates);

  // 5. Log run
  const duration = Date.now() - startTime;
  await logSchedulerRun('detection', 'success', `Detection complete: ${saved} new candidates`, {
    totalDetected: allCandidates.length, newSaved: saved, sourcesChecked, durationMs: duration,
  });

  await logAgentAction({
    agentName: 'Scraper',
    action: 'completed detection cycle',
    details: `${saved} new from ${allCandidates.length} detected across ${sourcesChecked} sources (${duration}ms)`,
  });

  console.log(`[DetectionWorker] Complete: ${saved}/${allCandidates.length} saved in ${duration}ms`);

  return { totalCandidates: allCandidates.length, newCandidates: saved, sourcesChecked, errors };
}

// Run if called directly
if (require.main === module) {
  runDetectionWorker().then(result => {
    console.log('Detection Worker Result:', result);
    process.exit(result.errors.length > 0 ? 1 : 0);
  }).catch(error => {
    console.error('Detection Worker Failed:', error);
    process.exit(1);
  });
}
