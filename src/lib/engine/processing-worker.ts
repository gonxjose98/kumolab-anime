/**
 * Processing Worker - FIXED VERSION
 * Heavy processing that runs every 60 minutes
 * Responsibilities: enrichment, scoring, deduplication, filtering, pending approval generation
 */

import { supabaseAdmin } from '../supabase/admin';
import { 
  SCORING_WEIGHTS,
  SCORING_PENALTIES,
  QUALITY_SIGNALS,
  SCORING_THRESHOLDS,
  DEDUPLICATION_CONFIG,
  type ContentScore
} from './intelligence-config';
import { logSchedulerRun } from '../logging/scheduler';

// Processing candidate interface
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
}

interface ProcessedResult {
  candidate: ProcessingCandidate;
  score: ContentScore;
  action: 'accept' | 'reject' | 'duplicate';
  duplicateOf?: string;
  enrichedData?: {
    animeName?: string;
    claimType?: string;
    releaseDate?: string;
    studio?: string;
    seasonNumber?: number;
  };
  error?: string;
}

/**
 * Calculate content score based on signals
 */
function calculateContentScore(
  candidate: ProcessingCandidate
): ContentScore {
  const breakdown = {
    sourceAuthority: 0,
    contentType: 0,
    visualEvidence: 0,
    temporalRelevance: 0
  };
  
  const title = candidate.title.toLowerCase();
  const content = candidate.content.toLowerCase();
  const combined = title + ' ' + content;
  
  // 1. Source Authority Score
  if (candidate.source_tier === 1) {
    breakdown.sourceAuthority = SCORING_WEIGHTS.OFFICIAL_STUDIO_SOURCE;
  } else if (candidate.source_tier === 2) {
    const publisherMatch = /kadokawa|aniplex|toho|shueisha|bandai|pony canyon/.test(combined);
    breakdown.sourceAuthority = publisherMatch 
      ? SCORING_WEIGHTS.PUBLISHER_CONFIRMATION 
      : SCORING_WEIGHTS.NEWS_DISTRIBUTOR;
  } else {
    breakdown.sourceAuthority = SCORING_WEIGHTS.SIGNAL_DETECTION;
  }
  
  // 2. Content Type Score
  if (/trailer|pv\s|teaser|promotional video/.test(combined)) {
    breakdown.contentType = SCORING_WEIGHTS.TRAILER_VIDEO;
  } else if (/season\s*\d+|\d+nd season|\d+rd season|\d+th season|new season|sequel/.test(combined)) {
    breakdown.contentType = SCORING_WEIGHTS.SEASON_CONFIRMATION;
  } else if (/key visual|visual revealed|new visual|main visual/.test(combined)) {
    breakdown.contentType = SCORING_WEIGHTS.KEY_VISUAL;
  } else if (/release date|premiere|airing|broadcast|debut/.test(combined)) {
    breakdown.contentType = SCORING_WEIGHTS.RELEASE_DATE;
  } else if (/cast|staff|director|voice actor|seiyuu/.test(combined)) {
    breakdown.contentType = SCORING_WEIGHTS.CAST_STAFF_UPDATE;
  } else if (/production|in production|greenlit|announced/.test(combined)) {
    breakdown.contentType = SCORING_WEIGHTS.PRODUCTION_NEWS;
  }
  
  // 3. Visual Evidence Score
  if (candidate.media_urls && candidate.media_urls.length > 0) {
    if (/key visual|main visual/.test(combined)) {
      breakdown.visualEvidence = SCORING_WEIGHTS.KEY_VISUAL_IMAGE;
    } else {
      breakdown.visualEvidence = SCORING_WEIGHTS.OFFICIAL_IMAGE;
    }
  }
  
  // 4. Temporal Relevance Score
  if (candidate.original_timestamp) {
    const age = Date.now() - new Date(candidate.original_timestamp).getTime();
    const hours = age / (1000 * 60 * 60);
    
    if (hours <= 1) {
      breakdown.temporalRelevance = SCORING_WEIGHTS.BREAKING_WITHIN_HOUR;
    } else if (hours <= 24) {
      breakdown.temporalRelevance = SCORING_WEIGHTS.RECENT_WITHIN_DAY;
    }
  }
  
  // 5. Apply Penalties
  let penalties = 0;
  
  if (/merchandise|merch|goods only|figure|toy|nendoroid|figma/.test(combined)) {
    penalties += SCORING_PENALTIES.MERCHANDISE_ONLY;
  }
  
  if (/\bfigure\b|\bfigurine\b|\bstatue\b|\bcollectible/.test(combined)) {
    penalties += SCORING_PENALTIES.FIGURES_TOYS;
  }
  
  if (/rumor|speculation|reportedly|allegedly|might|could|possibly/.test(combined)) {
    penalties += SCORING_PENALTIES.FAN_SPECULATION;
  }
  
  if (/\bgame\b(?!.*\banime\b).*\bannouncement\b/.test(combined)) {
    penalties += SCORING_PENALTIES.OFF_TOPIC;
  }
  
  // Calculate total
  const total = breakdown.sourceAuthority + breakdown.contentType + 
                breakdown.visualEvidence + breakdown.temporalRelevance + penalties;
  
  // Determine confidence
  let confidence: 'high' | 'medium' | 'low';
  if (total >= SCORING_THRESHOLDS.HIGH_CONFIDENCE) {
    confidence = 'high';
  } else if (total >= SCORING_THRESHOLDS.PUBLISH_MINIMUM) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  
  return {
    total,
    breakdown,
    confidence,
    publishThreshold: total >= SCORING_THRESHOLDS.PUBLISH_MINIMUM
  };
}

/**
 * Extract anime name from title/content
 */
function extractAnimeName(title: string, content: string): string | undefined {
  const patterns = [
    /^(.+?)\s+(?:Season|Movie|Film|Anime)/i,
    /^(?:New|Latest)\s+(.+?)\s+(?:Trailer|PV|Teaser|Visual)/i,
    /^(?:Trailer|PV|Teaser|Visual)\s+(?:for|of)\s+(.+?)(?:\s+Released|$)/i,
    /(.+?)\s+(?:Announces|Reveals|Confirms)/i
  ];
  
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return undefined;
}

/**
 * Determine claim type from content
 */
function determineClaimType(title: string, content: string): string {
  const combined = (title + ' ' + content).toLowerCase();
  
  if (/trailer|pv|promotional video|teaser/.test(combined)) {
    return 'TRAILER_DROP';
  } else if (/season\s*\d+|new season|sequel|2nd season|3rd season/.test(combined)) {
    return 'NEW_SEASON_CONFIRMED';
  } else if (/key visual|main visual|visual revealed/.test(combined)) {
    return 'NEW_KEY_VISUAL';
  } else if (/release date|premiere date|air date/.test(combined)) {
    return 'DATE_ANNOUNCED';
  } else if (/delay|postpone|reschedule|pushed back/.test(combined)) {
    return 'DELAY';
  } else if (/cast|voice actor|seiyuu|staff|director/.test(combined)) {
    return 'CAST_ADDITION';
  } else {
    return 'OTHER';
  }
}

/**
 * Check for duplicates against existing posts
 */
async function checkForDuplicates(
  candidate: ProcessingCandidate,
  animeName?: string
): Promise<{ isDuplicate: boolean; duplicateOf?: string; similarity: number }> {
  // 1. Check exact fingerprint match
  const { data: fingerprintMatch } = await supabaseAdmin
    .from('posts')
    .select('id, title')
    .eq('fingerprint', candidate.fingerprint)
    .gte('timestamp', new Date(Date.now() - DEDUPLICATION_CONFIG.CHECK_WINDOW * 60 * 60 * 1000).toISOString())
    .limit(1);
  
  if (fingerprintMatch && fingerprintMatch.length > 0) {
    return { isDuplicate: true, duplicateOf: fingerprintMatch[0].id, similarity: 1.0 };
  }
  
  // 2. Check URL match
  const { data: urlMatch } = await supabaseAdmin
    .from('posts')
    .select('id')
    .eq('source_url', candidate.canonical_url)
    .limit(1);
  
  if (urlMatch && urlMatch.length > 0) {
    return { isDuplicate: true, duplicateOf: urlMatch[0].id, similarity: 1.0 };
  }
  
  // 3. Check anime_id + event type match if we have anime name
  if (animeName) {
    const normalizedName = animeName.toLowerCase().replace(/[^\w]/g, '');
    const { data: animeMatch } = await supabaseAdmin
      .from('posts')
      .select('id, title, claim_type')
      .ilike('title', `%${animeName}%`)
      .gte('timestamp', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
      .limit(5);
    
    if (animeMatch && animeMatch.length > 0) {
      const claimType = determineClaimType(candidate.title, candidate.content);
      const similarPost = animeMatch.find(p => p.claim_type === claimType);
      if (similarPost) {
        return { isDuplicate: true, duplicateOf: similarPost.id, similarity: 0.9 };
      }
    }
  }
  
  // 4. Check similarity with recent pending candidates
  const { data: pendingMatch } = await supabaseAdmin
    .from('detection_candidates')
    .select('id, title, fingerprint')
    .eq('status', 'pending_processing')
    .neq('id', candidate.id)
    .gte('detected_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .limit(20);
  
  if (pendingMatch) {
    for (const pending of pendingMatch) {
      const similarity = calculateSimilarity(candidate.title, pending.title);
      if (similarity >= DEDUPLICATION_CONFIG.SIMILARITY_THRESHOLD) {
        return { isDuplicate: true, duplicateOf: pending.id, similarity };
      }
    }
  }
  
  return { isDuplicate: false, similarity: 0 };
}

/**
 * Calculate string similarity (Jaccard index)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.toLowerCase().split(/\s+/));
  const set2 = new Set(str2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

/**
 * Generate post slug
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 80);
}

/**
 * Sanitize string for database
 */
function sanitizeString(str: string | null | undefined, maxLength: number = 200): string {
  if (!str) return '';
  return str.substring(0, maxLength).replace(/\x00/g, '');
}

/**
 * Create pending post from candidate - FIXED VERSION
 */
async function createPendingPost(
  candidate: ProcessingCandidate,
  score: ContentScore,
  enrichedData: any
): Promise<{ success: boolean; error?: string; postId?: string }> {
  try {
    const now = new Date().toISOString();
    const slug = generateSlug(candidate.title);
    
    // Build post with validation
    const post: Record<string, any> = {};
    
    // Required fields
    post.title = sanitizeString(candidate.title, 200);
    post.slug = `${slug}-${Date.now().toString(36)}`;
    post.type = 'INTEL';
    post.claim_type = enrichedData.claimType || 'OTHER';
    post.content = sanitizeString(candidate.content, 5000);
    post.excerpt = sanitizeString(candidate.content, 197) + '...';
    
    // Optional fields
    post.image = candidate.media_urls && candidate.media_urls.length > 0 
      ? candidate.media_urls[0] 
      : null;
    post.source_url = candidate.canonical_url || candidate.source_url || '';
    post.source = candidate.source_name || 'Unknown';
    post.source_tier = candidate.source_tier || 2;
    post.timestamp = now;
    post.status = 'pending';
    post.scraped_at = candidate.detected_at || now;
    post.fingerprint = candidate.fingerprint || `${Date.now()}`;
    post.headline = sanitizeString(candidate.title, 100);
    
    // Log what we're trying to insert
    console.log('[ProcessingWorker] Inserting post:', {
      title: post.title,
      slug: post.slug,
      type: post.type,
      claim_type: post.claim_type,
      status: post.status,
      source: post.source,
      source_tier: post.source_tier
    });
    
    const { data, error } = await supabaseAdmin
      .from('posts')
      .insert([post])
      .select();
    
    if (error) {
      console.error('[ProcessingWorker] Supabase error:', JSON.stringify(error, null, 2));
      return { 
        success: false, 
        error: `Supabase error: ${error.message} (code: ${error.code})` 
      };
    }
    
    if (!data || data.length === 0) {
      return { success: false, error: 'No data returned from insert' };
    }
    
    console.log('[ProcessingWorker] Post created successfully:', data[0].id);
    return { success: true, postId: data[0].id };
    
  } catch (error: any) {
    console.error('[ProcessingWorker] Exception creating post:', error);
    return { 
      success: false, 
      error: `Exception: ${error.message}` 
    };
  }
}

/**
 * Mark candidate as processed
 */
async function markCandidateProcessed(
  candidateId: string,
  status: 'processed' | 'discarded',
  result: ProcessedResult
): Promise<void> {
  const updateData: any = {
    status,
    processed_at: new Date().toISOString(),
    score: result.score.total,
    score_breakdown: result.score.breakdown,
    action_taken: result.action,
    duplicate_of: result.duplicateOf || null
  };
  
  if (result.error) {
    updateData.error_message = result.error;
  }
  
  const { error } = await supabaseAdmin
    .from('detection_candidates')
    .update(updateData)
    .eq('id', candidateId);
    
  if (error) {
    console.error('[ProcessingWorker] Failed to mark candidate processed:', error);
  }
}

/**
 * Main Processing Worker function - FIXED VERSION
 */
export async function runProcessingWorker(): Promise<{
  processed: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  errors: string[];
}> {
  console.log('[ProcessingWorker] Starting processing cycle...');
  console.log('[ProcessingWorker] Publish threshold:', SCORING_THRESHOLDS.PUBLISH_MINIMUM);
  const startTime = Date.now();
  
  const stats = {
    processed: 0,
    accepted: 0,
    rejected: 0,
    duplicates: 0,
    errors: [] as string[]
  };
  
  try {
    // 1. Fetch pending candidates
    const { data: candidates, error } = await supabaseAdmin
      .from('detection_candidates')
      .select('*')
      .eq('status', 'pending_processing')
      .order('detected_at', { ascending: false })
      .limit(50);
    
    if (error) {
      throw new Error(`Failed to fetch candidates: ${error.message}`);
    }
    
    if (!candidates || candidates.length === 0) {
      console.log('[ProcessingWorker] No candidates to process');
      return stats;
    }
    
    console.log(`[ProcessingWorker] Processing ${candidates.length} candidates...`);
    
    // 2. Process each candidate
    for (const candidate of candidates) {
      try {
        stats.processed++;
        console.log(`[ProcessingWorker] Processing candidate ${candidate.id}: ${candidate.title.substring(0, 50)}...`);
        
        // Calculate score
        const score = calculateContentScore(candidate);
        console.log(`[ProcessingWorker] Score: ${score.total}, Threshold: ${SCORING_THRESHOLDS.PUBLISH_MINIMUM}, Pass: ${score.publishThreshold}`);
        
        // Extract enriched data
        const animeName = extractAnimeName(candidate.title, candidate.content);
        const enrichedData = {
          animeName,
          claimType: determineClaimType(candidate.title, candidate.content),
          studio: candidate.source_name.includes('YouTube') 
            ? candidate.metadata?.channel_name 
            : undefined
        };
        
        // Check for duplicates
        const dupCheck = await checkForDuplicates(candidate, animeName);
        
        let result: ProcessedResult;
        
        if (dupCheck.isDuplicate) {
          result = {
            candidate,
            score,
            action: 'duplicate',
            duplicateOf: dupCheck.duplicateOf,
            enrichedData
          };
          stats.duplicates++;
          console.log(`[ProcessingWorker] Candidate ${candidate.id} is duplicate of ${dupCheck.duplicateOf}`);
        } else if (score.total < SCORING_THRESHOLDS.PUBLISH_MINIMUM) {
          result = {
            candidate,
            score,
            action: 'reject',
            enrichedData
          };
          stats.rejected++;
          console.log(`[ProcessingWorker] Candidate ${candidate.id} rejected - score ${score.total} below threshold ${SCORING_THRESHOLDS.PUBLISH_MINIMUM}`);
        } else {
          // Accept and create pending post
          console.log(`[ProcessingWorker] Creating post for candidate ${candidate.id}...`);
          const createResult = await createPendingPost(candidate, score, enrichedData);
          
          if (createResult.success) {
            result = {
              candidate,
              score,
              action: 'accept',
              enrichedData
            };
            stats.accepted++;
            console.log(`[ProcessingWorker] Post created: ${createResult.postId}`);
          } else {
            result = {
              candidate,
              score,
              action: 'reject',
              enrichedData,
              error: createResult.error
            };
            stats.rejected++;
            stats.errors.push(`Failed to create post for ${candidate.id}: ${createResult.error}`);
            console.error(`[ProcessingWorker] Failed to create post: ${createResult.error}`);
          }
        }
        
        // Mark as processed
        await markCandidateProcessed(
          candidate.id,
          result.action === 'accept' ? 'processed' : 'discarded',
          result
        );
        
      } catch (error: any) {
        const errorMsg = `Candidate ${candidate.id}: ${error.message}`;
        stats.errors.push(errorMsg);
        console.error(`[ProcessingWorker] Error processing candidate ${candidate.id}:`, error);
        
        // Still mark as processed to avoid infinite retry
        await markCandidateProcessed(
          candidate.id,
          'discarded',
          {
            candidate,
            score: { total: 0, breakdown: { sourceAuthority: 0, contentType: 0, visualEvidence: 0, temporalRelevance: 0 }, confidence: 'low', publishThreshold: false },
            action: 'reject',
            error: error.message
          }
        );
      }
    }
    
    // 3. Log results
    const duration = Date.now() - startTime;
    await logSchedulerRun('processing', 'success', 
      `Processing complete: ${stats.accepted} accepted, ${stats.rejected} rejected, ${stats.duplicates} duplicates`,
      stats
    );
    
    console.log(`[ProcessingWorker] Complete in ${duration}ms:`, stats);
    
  } catch (error: any) {
    stats.errors.push(error.message);
    await logSchedulerRun('processing', 'error', error.message, { error: error.message });
    console.error('[ProcessingWorker] Fatal error:', error);
  }
  
  return stats;
}

// Run if called directly
if (require.main === module) {
  runProcessingWorker().then(result => {
    console.log('Processing Worker Result:', result);
    process.exit(result.errors.length > 0 && result.processed === 0 ? 1 : 0);
  }).catch(error => {
    console.error('Processing Worker Failed:', error);
    process.exit(1);
  });
}
