/**
 * Detection Worker
 * Lightweight scraper that runs every 10 minutes
 * Responsibilities: RSS checks, YouTube uploads, lightweight HTML checks
 * Generates candidate records only - NO heavy processing
 */

import { supabaseAdmin } from '../supabase/admin';
import { 
  TIER_2_RSS_SOURCES, 
  TIER_3_SOURCES,
  RELIABILITY_CONFIG,
  type SourceConfig 
} from './intelligence-config';
import { logSchedulerRun } from '../logging/scheduler';

// Candidate record interface
interface DetectionCandidate {
  id?: string;
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
  status: 'pending_processing' | 'processing' | 'processed' | 'discarded';
  fingerprint?: string;
  metadata?: Record<string, any>;
}

// Source health tracking
interface SourceHealth {
  name: string;
  healthScore: number;
  consecutiveFailures: number;
  lastCheck: Date | null;
  lastSuccess: Date | null;
  isEnabled: boolean;
  skippedUntil?: Date;
}

// In-memory health tracking
const sourceHealth: Map<string, SourceHealth> = new Map();

/**
 * Initialize source health tracking
 */
function initializeSourceHealth() {
  for (const source of TIER_2_RSS_SOURCES) {
    sourceHealth.set(source.name, {
      name: source.name,
      healthScore: source.healthScore,
      consecutiveFailures: 0,
      lastCheck: null,
      lastSuccess: null,
      isEnabled: true
    });
  }
}

/**
 * Update source health after check
 */
function updateSourceHealth(sourceName: string, success: boolean, error?: string) {
  const health = sourceHealth.get(sourceName);
  if (!health) return;
  
  health.lastCheck = new Date();
  
  if (success) {
    health.healthScore = Math.min(100, health.healthScore + RELIABILITY_CONFIG.HEALTH_RECOVERY);
    health.consecutiveFailures = 0;
    health.lastSuccess = new Date();
    health.isEnabled = true;
  } else {
    health.healthScore = Math.max(0, health.healthScore - RELIABILITY_CONFIG.HEALTH_DECAY);
    health.consecutiveFailures++;
    
    // Disable source if health too low
    if (health.healthScore < RELIABILITY_CONFIG.HEALTH_THRESHOLD) {
      health.isEnabled = false;
      health.skippedUntil = new Date(Date.now() + RELIABILITY_CONFIG.SKIP_DURATION_MINUTES * 60 * 1000);
      console.log(`[DetectionWorker] Disabled source ${sourceName} due to low health (${health.healthScore})`);
    }
    
    // Log failure
    if (health.consecutiveFailures >= RELIABILITY_CONFIG.SKIP_AFTER_FAILURES) {
      console.warn(`[DetectionWorker] Source ${sourceName} failed ${health.consecutiveFailures} times consecutively`);
    }
  }
}

/**
 * Check if source should be skipped
 */
function shouldSkipSource(sourceName: string): boolean {
  const health = sourceHealth.get(sourceName);
  if (!health) return false;
  
  if (!health.isEnabled && health.skippedUntil) {
    if (new Date() < health.skippedUntil) {
      return true;
    }
    // Re-enable after skip duration
    health.isEnabled = true;
    health.skippedUntil = undefined;
  }
  
  return false;
}

/**
 * Fetch RSS feed with retry logic
 */
async function fetchRSSWithRetry(url: string, retries = 0): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/rss+xml, application/xml, text/xml',
        'User-Agent': 'KumoLab-DetectionWorker/1.0'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.text();
  } catch (error) {
    if (retries < RELIABILITY_CONFIG.MAX_RETRIES) {
      const delay = Math.min(
        RELIABILITY_CONFIG.RETRY_DELAY_BASE * Math.pow(2, retries),
        RELIABILITY_CONFIG.RETRY_DELAY_MAX
      );
      await new Promise(r => setTimeout(r, delay));
      return fetchRSSWithRetry(url, retries + 1);
    }
    return null;
  }
}

/**
 * Parse RSS items from XML
 */
function parseRSSItems(xmlText: string, sourceName: string): DetectionCandidate[] {
  const candidates: DetectionCandidate[] = [];
  
  try {
    // Extract items using regex (lightweight, no XML parser needed)
    const itemRegex = /<item>[\s\S]*?<\/item>/g;
    const items = xmlText.match(itemRegex) || [];
    
    for (const item of items.slice(0, 10)) { // Process max 10 recent items
      const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
      const linkMatch = item.match(/<link>(.*?)<\/link>/);
      const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
      const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
      
      const title = titleMatch ? decodeHTMLEntities(titleMatch[1]) : '';
      const link = linkMatch ? linkMatch[1] : '';
      const pubDate = pubDateMatch ? pubDateMatch[1] : '';
      const description = descMatch ? decodeHTMLEntities(descMatch[1]) : '';
      
      if (!title || !link) continue;
      
      // Extract media URLs from content
      const mediaUrls: string[] = [];
      const imgRegex = /<img[^>]+src="([^"]+)"/g;
      let imgMatch;
      while ((imgMatch = imgRegex.exec(description)) !== null) {
        mediaUrls.push(imgMatch[1]);
      }
      
      // Create fingerprint
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
        fingerprint
      });
    }
  } catch (error) {
    console.error(`[DetectionWorker] Error parsing RSS from ${sourceName}:`, error);
  }
  
  return candidates;
}

/**
 * Create content fingerprint for deduplication
 */
function createFingerprint(title: string, url: string): string {
  const normalized = title.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 50);
  
  // Simple hash
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return `${normalized.replace(/\s/g, '_')}_${Math.abs(hash).toString(36).substring(0, 8)}`;
}

/**
 * Decode HTML entities
 */
function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strip HTML tags
 */
function stripHTML(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if candidate already exists in database
 */
async function isDuplicateCandidate(fingerprint: string, url: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('detection_candidates')
    .select('id')
    .or(`fingerprint.eq.${fingerprint},source_url.eq.${url}`)
    .gte('detected_at', new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()) // 72 hours
    .limit(1);
  
  return data && data.length > 0;
}

/**
 * Save candidates to database
 */
async function saveCandidates(candidates: DetectionCandidate[]): Promise<number> {
  let saved = 0;
  
  for (const candidate of candidates) {
    try {
      // Check for duplicates
      if (await isDuplicateCandidate(candidate.fingerprint!, candidate.source_url)) {
        continue;
      }
      
      const { error } = await supabaseAdmin
        .from('detection_candidates')
        .insert([{
          ...candidate,
          created_at: new Date().toISOString()
        }]);
      
      if (!error) {
        saved++;
      }
    } catch (e) {
      console.error('[DetectionWorker] Error saving candidate:', e);
    }
  }
  
  return saved;
}

/**
 * Scan YouTube for new uploads
 */
async function scanYouTubeForDetection(): Promise<DetectionCandidate[]> {
  const candidates: DetectionCandidate[] = [];
  const youtubeApiKey = process.env.YOUTUBE_API_KEY;
  
  if (!youtubeApiKey) {
    console.log('[DetectionWorker] YouTube API key not configured');
    return candidates;
  }
  
  // Tier 1 YouTube channels
  const channels = [
    { id: 'UCZxsdzmU3OoC9Q8Z3swoS6g', name: 'MAPPA', tier: 1 },
    { id: 'UCgHfufyA9n6qMvo3K0XBp2w', name: 'Ufotable', tier: 1 },
    { id: 'UCp8LObSyk0vZ02NF4_7PcWg', name: 'TOHO Animation', tier: 1 },
    { id: 'UC8ZxQ3yL9sT7y8m6h3Z7K2A', name: 'Aniplex', tier: 1 },
  ];
  
  for (const channel of channels) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channel.id}&maxResults=3&order=date&publishedAfter=${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()}&key=${youtubeApiKey}`;
      
      const response = await fetch(url);
      if (!response.ok) continue;
      
      const data = await response.json();
      
      for (const item of data.items || []) {
        const videoId = item.id?.videoId;
        if (!videoId) continue;
        
        const title = item.snippet?.title || '';
        const description = item.snippet?.description || '';
        const publishedAt = item.snippet?.publishedAt;
        
        // Check for anime-related keywords
        const animeKeywords = ['trailer', 'pv', 'teaser', 'announcement', 'preview', 'key visual'];
        const hasAnimeKeyword = animeKeywords.some(kw => 
          title.toLowerCase().includes(kw) || description.toLowerCase().includes(kw)
        );
        
        if (!hasAnimeKeyword) continue;
        
        const fingerprint = createFingerprint(title, videoId);
        
        candidates.push({
          source_name: `YouTube_${channel.name}`,
          source_tier: channel.tier as 1 | 2 | 3,
          source_url: `https://youtube.com/watch?v=${videoId}`,
          title: title.substring(0, 200),
          content: description.substring(0, 1000),
          detected_at: new Date().toISOString(),
          original_timestamp: publishedAt,
          media_urls: [`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`],
          canonical_url: `https://youtube.com/watch?v=${videoId}`,
          extraction_method: 'YouTube',
          status: 'pending_processing',
          fingerprint,
          metadata: {
            video_id: videoId,
            channel_name: channel.name
          }
        });
      }
    } catch (error) {
      console.error(`[DetectionWorker] YouTube error for ${channel.name}:`, error);
    }
  }
  
  return candidates;
}

/**
 * Main Detection Worker function
 */
export async function runDetectionWorker(): Promise<{
  totalCandidates: number;
  newCandidates: number;
  sourcesChecked: number;
  errors: string[];
}> {
  console.log('[DetectionWorker] Starting detection cycle...');
  const startTime = Date.now();
  
  // Initialize health tracking if needed
  if (sourceHealth.size === 0) {
    initializeSourceHealth();
  }
  
  const allCandidates: DetectionCandidate[] = [];
  const errors: string[] = [];
  let sourcesChecked = 0;
  
  // 1. Scan RSS feeds (Tier 2)
  console.log('[DetectionWorker] Scanning RSS feeds...');
  for (const source of TIER_2_RSS_SOURCES) {
    if (shouldSkipSource(source.name)) {
      console.log(`[DetectionWorker] Skipping ${source.name} (disabled)`);
      continue;
    }
    
    sourcesChecked++;
    
    try {
      const xmlText = await fetchRSSWithRetry(source.url);
      
      if (xmlText) {
        const candidates = parseRSSItems(xmlText, source.name);
        allCandidates.push(...candidates);
        updateSourceHealth(source.name, true);
        console.log(`[DetectionWorker] ${source.name}: ${candidates.length} candidates`);
      } else {
        updateSourceHealth(source.name, false);
        errors.push(`${source.name}: Failed to fetch`);
      }
    } catch (error: any) {
      updateSourceHealth(source.name, false, error.message);
      errors.push(`${source.name}: ${error.message}`);
    }
  }
  
  // 2. Scan YouTube (Tier 1)
  console.log('[DetectionWorker] Scanning YouTube...');
  try {
    const youtubeCandidates = await scanYouTubeForDetection();
    allCandidates.push(...youtubeCandidates);
    console.log(`[DetectionWorker] YouTube: ${youtubeCandidates.length} candidates`);
  } catch (error: any) {
    errors.push(`YouTube: ${error.message}`);
  }
  
  // 3. Save candidates to database
  console.log(`[DetectionWorker] Saving ${allCandidates.length} candidates...`);
  const saved = await saveCandidates(allCandidates);
  
  // 4. Log run
  const duration = Date.now() - startTime;
  await logSchedulerRun('detection', 'success', `Detection worker complete: ${saved} new candidates`, {
    totalDetected: allCandidates.length,
    newSaved: saved,
    sourcesChecked,
    durationMs: duration
  });
  
  console.log(`[DetectionWorker] Complete: ${saved}/${allCandidates.length} saved in ${duration}ms`);
  
  return {
    totalCandidates: allCandidates.length,
    newCandidates: saved,
    sourcesChecked,
    errors
  };
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
