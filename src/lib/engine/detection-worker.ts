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
import { logSchedulerRun } from '../logging/scheduler';
import { logScraperDecision, logError, logAgentAction } from '../logging/structured-logger';
import { fetchSmartTrendingCandidates } from './fetchers';

// Candidate record interface
interface DetectionCandidate {
  source_name: string;
  source_tier: 1 | 2 | 3;
  source_url: string;
  title: string;
  content: string;
  raw_content?: string;
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
        raw_content: description,
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

// ─── Fingerprint ────────────────────────────────────────────

function createFingerprint(title: string, url: string): string {
  const normalized = title.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim().substring(0, 80);
  const domain = url.replace(/^https?:\/\//, '').split('/')[0] || '';
  let hash = 0;
  const input = normalized + '|' + domain;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash = hash & hash;
  }
  return `${normalized.replace(/\s/g, '_').substring(0, 40)}_${Math.abs(hash).toString(36)}`;
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

// ─── Duplicate Check (candidates + posts) ───────────────────

async function isDuplicateCandidate(fingerprint: string, url: string, title: string): Promise<{ isDup: boolean; reason?: string }> {
  // 1. Check detection_candidates (72h)
  const { data: candMatch } = await supabaseAdmin
    .from('detection_candidates')
    .select('id')
    .or(`fingerprint.eq.${fingerprint},source_url.eq.${url}`)
    .gte('detected_at', new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString())
    .limit(1);

  if (candMatch && candMatch.length > 0) {
    return { isDup: true, reason: 'Already in candidates' };
  }

  // 2. Check posts by URL (no time limit — never re-detect a published URL)
  const { data: postUrlMatch } = await supabaseAdmin
    .from('posts')
    .select('id')
    .eq('source_url', url)
    .limit(1);

  if (postUrlMatch && postUrlMatch.length > 0) {
    return { isDup: true, reason: 'URL already published' };
  }

  // 3. Check posts by title similarity (7 day window)
  const { data: recentPosts } = await supabaseAdmin
    .from('posts')
    .select('id, title')
    .gte('timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .limit(100);

  if (recentPosts) {
    const candidateWords = new Set(title.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    for (const post of recentPosts) {
      const postWords = new Set(post.title.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2));
      const intersection = [...candidateWords].filter((w: string) => postWords.has(w));
      const union = new Set([...candidateWords, ...postWords]);
      const similarity = union.size > 0 ? intersection.length / union.size : 0;
      if (similarity >= 0.70) {
        return { isDup: true, reason: `Similar to post ${post.id.slice(0, 8)}` };
      }
    }
  }

  return { isDup: false };
}

// ─── YouTube via RSS (no API quota) ─────────────────────────

async function scanYouTubeViaRSS(): Promise<DetectionCandidate[]> {
  // Only scan between 6 AM and 9 PM EST
  const estTimeStr = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false });
  const estHour = parseInt(estTimeStr);
  if (estHour < 6 || estHour >= 21) {
    console.log(`[DetectionWorker] YouTube skipped — outside active hours (${estHour} EST)`);
    return [];
  }

  const candidates: DetectionCandidate[] = [];

  // YouTube RSS feeds — free, unlimited, no API key needed
  const channels = [
    { id: 'UCjfAEJZdfbIjVHdo5yODfyQ', name: 'MAPPA' },
    { id: 'UCRc3mprfrE8qaugB1VfQXiA', name: 'Ufotable' },
    { id: 'UC14Yc2Qv92DMuyNRlHvpo2Q', name: 'TOHO Animation' },
    { id: 'UCDb0peSmF5rLX7BvuTcJfCw', name: 'Aniplex' },
  ];

  for (const channel of channels) {
    try {
      const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`;
      const xml = await fetchRSSWithRetry(rssUrl);
      if (!xml) continue;

      const entryRegex = /<entry>[\s\S]*?<\/entry>/g;
      const entries = xml.match(entryRegex) || [];

      for (const entry of entries.slice(0, 3)) {
        const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
        const videoIdMatch = entry.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/);
        const publishedMatch = entry.match(/<published>([\s\S]*?)<\/published>/);

        const title = titleMatch ? titleMatch[1].trim() : '';
        const videoId = videoIdMatch ? videoIdMatch[1].trim() : '';
        if (!title || !videoId) continue;

        const publishedAt = publishedMatch ? publishedMatch[1].trim() : '';
        // Only videos from last 48 hours
        if (publishedAt && (Date.now() - new Date(publishedAt).getTime()) > 48 * 60 * 60 * 1000) continue;

        const animeKeywords = ['trailer', 'pv', 'teaser', 'announcement', 'preview', 'key visual',
          'opening', 'ending', 'cm', 'season', 'episode', 'anime', 'release', 'broadcast', '予告', 'ティザー'];
        if (!animeKeywords.some(kw => title.toLowerCase().includes(kw.toLowerCase()))) continue;

        const fingerprint = createFingerprint(title, videoId);

        candidates.push({
          source_name: `YouTube_${channel.name}`,
          source_tier: 1,
          source_url: `https://youtube.com/watch?v=${videoId}`,
          title: title.substring(0, 200),
          content: `Official upload from ${channel.name}`,
          detected_at: new Date().toISOString(),
          original_timestamp: publishedAt || undefined,
          media_urls: [`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`],
          canonical_url: `https://youtube.com/watch?v=${videoId}`,
          extraction_method: 'YouTube',
          status: 'pending_processing',
          fingerprint,
          metadata: { video_id: videoId, channel_name: channel.name },
        });
      }
    } catch (error) {
      console.error(`[DetectionWorker] YouTube RSS error for ${channel.name}:`, error);
    }
  }

  return candidates;
}

// ─── YouTube via Data API (quota-limited) ───────────────────

const YOUTUBE_API_CHANNELS = [
  { id: 'UCZxsdzmU3OoC9Q8Z3swoS6g', name: 'MAPPA Official' },
  { id: 'UCgHfufyA9n6qMvo3K0XBp2w', name: 'Ufotable' },
  { id: 'UCp8LObSyk0vZ02NF4_7PcWg', name: 'TOHO Animation' },
  { id: 'UC2xDictxIa66VdNG1PaIyQ', name: 'A-1 Pictures' },
  { id: 'UC3ryC1YkgR0eJ1O4C9jP-Q', name: 'CloverWorks' },
  { id: 'UCqmNf2x0c3y9fL8F5xM1A9w', name: 'Kadokawa' },
];

async function scanYouTubeAPI(): Promise<DetectionCandidate[]> {
  const apiKey = process.env.YOUTUBE_API_KEY || '';
  if (!apiKey) {
    console.log('[DetectionWorker] YouTube API key not set, skipping');
    return [];
  }

  // Only scan between 6 AM and 9 PM EST
  const estTimeStr = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false });
  const estHour = parseInt(estTimeStr);
  if (estHour < 6 || estHour >= 21) return [];

  const candidates: DetectionCandidate[] = [];
  // Rotate: pick 2 random channels per run to stay under quota
  const shuffled = [...YOUTUBE_API_CHANNELS].sort(() => Math.random() - 0.5);
  const toScan = shuffled.slice(0, 2);

  for (const channel of toScan) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channel.id}&order=date&maxResults=5&type=video&publishedAfter=${new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()}&key=${apiKey}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        console.log(`[DetectionWorker] YouTube API ${channel.name}: HTTP ${response.status}`);
        continue;
      }
      const data = await response.json();
      if (!data.items?.length) continue;

      for (const video of data.items) {
        const title = video.snippet?.title || '';
        const videoId = video.id?.videoId || '';
        if (!title || !videoId) continue;

        const fingerprint = createFingerprint(title, videoId);
        candidates.push({
          source_name: `YouTube_API_${channel.name}`,
          source_tier: 1,
          source_url: `https://youtube.com/watch?v=${videoId}`,
          title: title.substring(0, 200),
          content: (video.snippet?.description || '').substring(0, 1000),
          detected_at: new Date().toISOString(),
          original_timestamp: video.snippet?.publishedAt || undefined,
          media_urls: [
            video.snippet?.thumbnails?.maxres?.url || video.snippet?.thumbnails?.high?.url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
          ],
          canonical_url: `https://youtube.com/watch?v=${videoId}`,
          extraction_method: 'YouTube',
          status: 'pending_processing',
          fingerprint,
          metadata: { video_id: videoId, channel_name: channel.name, via: 'api' },
        });
      }
      console.log(`[DetectionWorker] YouTube API ${channel.name}: ${data.items.length} videos`);
    } catch (error: any) {
      console.error(`[DetectionWorker] YouTube API ${channel.name} error:`, error.message);
    }
  }

  return candidates;
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

      const { error } = await supabaseAdmin
        .from('detection_candidates')
        .insert([{ ...candidate, created_at: new Date().toISOString() }]);

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

  // 2. Scan YouTube via RSS (Tier 1) — 6 AM to 9 PM EST only
  console.log('[DetectionWorker] Scanning YouTube (RSS)...');
  try {
    const youtubeCandidates = await scanYouTubeViaRSS();
    allCandidates.push(...youtubeCandidates);
    sourcesChecked++;
    console.log(`[DetectionWorker] YouTube RSS: ${youtubeCandidates.length} candidates`);
  } catch (error: any) {
    errors.push(`YouTube RSS: ${error.message}`);
    await logError({ source: 'detection-worker', errorMessage: error.message, context: { module: 'youtube-rss' } });
  }

  // 2b. Scan YouTube via Data API (2 channels per run, quota-friendly)
  console.log('[DetectionWorker] Scanning YouTube API (2 channels)...');
  try {
    const ytApiCandidates = await scanYouTubeAPI();
    allCandidates.push(...ytApiCandidates);
    sourcesChecked++;
    console.log(`[DetectionWorker] YouTube API: ${ytApiCandidates.length} candidates`);
  } catch (error: any) {
    errors.push(`YouTube API: ${error.message}`);
    await logError({ source: 'detection-worker', errorMessage: error.message, context: { module: 'youtube-api' } });
  }

  // 3. Scan Newsroom (AniList trending, Reddit)
  console.log('[DetectionWorker] Scanning Newsroom sources...');
  try {
    const { candidates: newsroomItems, telemetry } = await fetchSmartTrendingCandidates();
    console.log(`[DetectionWorker] Newsroom: ${newsroomItems.length} candidates (raw: ${telemetry.totalRawItems})`);

    for (const item of newsroomItems.slice(0, 15)) {
      const title = item.title || '';
      if (!title || title.length < 5) continue;

      const fingerprint = createFingerprint(title, item.source_url || item.source || 'newsroom');

      allCandidates.push({
        source_name: item.source || 'KumoLab Newsroom',
        source_tier: (item.verification_tier as 1 | 2 | 3) || 2,
        source_url: item.source_url || '',
        title: title.substring(0, 200),
        content: (item.description || item.content || '').substring(0, 1000),
        detected_at: new Date().toISOString(),
        media_urls: item.image ? [item.image] : (item.announcementAssets || []),
        canonical_url: item.source_url || '',
        extraction_method: 'HTML',
        status: 'pending_processing',
        fingerprint,
        metadata: {
          claim_type: item.claimType,
          anime_id: item.anime_id,
          season_label: item.season_label,
          sources: item.sources,
          final_score: item.finalScore,
          event_fingerprint: item.event_fingerprint,
          truth_fingerprint: item.truth_fingerprint,
        },
      });
    }
    sourcesChecked += 4;
  } catch (error: any) {
    console.error('[DetectionWorker] Newsroom error:', error?.message || error);
    errors.push(`Newsroom: ${error.message}`);
    await logError({ source: 'detection-worker', errorMessage: error.message, context: { module: 'newsroom' } });
  }

  // 4. Save candidates
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
