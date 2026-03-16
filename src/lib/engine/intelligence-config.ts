/**
 * NEW Architecture: 3-Tier Source Intelligence System
 * Non-API anime intelligence ingestion model
 * 
 * TIER 1: Primary Sources (Official studios, publishers, YouTube)
 * TIER 2: Verified News Distributors (RSS feeds)
 * TIER 3: Signal Detection (Nitter, aggregators - validation only)
 */

// ============================================
// TIER 1 — PRIMARY SOURCES (Highest Trust)
// ============================================

export const TIER_1_SOURCES = {
  // Official Studio Websites & RSS
  STUDIOS: [
    { name: 'MAPPA', url: 'https://www.mappa.co.jp', rss: null, tier: 1, weight: 10 },
    { name: 'Ufotable', url: 'https://www.ufotable.com', rss: null, tier: 1, weight: 10 },
    { name: 'Kyoto Animation', url: 'https://www.kyotoanimation.co.jp', rss: 'https://www.kyotoanimation.co.jp/feed/', tier: 1, weight: 10 },
    { name: 'A-1 Pictures', url: 'https://a1p.jp', rss: null, tier: 1, weight: 9 },
    { name: 'Wit Studio', url: 'https://witstudio.co.jp', rss: null, tier: 1, weight: 9 },
    { name: 'CloverWorks', url: 'https://cloverworks.co.jp', rss: null, tier: 1, weight: 9 },
    { name: 'Trigger', url: 'https://www.st-trigger.co.jp', rss: null, tier: 1, weight: 9 },
    { name: 'Bones', url: 'http://www.bones.co.jp', rss: null, tier: 1, weight: 9 },
    { name: 'Madhouse', url: 'https://www.madhouse.co.jp', rss: null, tier: 1, weight: 9 },
    { name: 'Production I.G', url: 'https://www.production-ig.co.jp', rss: null, tier: 1, weight: 9 },
    { name: 'Science SARU', url: 'https://www.sciencesaru.com', rss: null, tier: 1, weight: 9 },
    { name: 'Toei Animation', url: 'https://www.toei-anim.co.jp', rss: 'https://www.toei-anim.co.jp/rss/news.xml', tier: 1, weight: 10 },
    { name: 'Pierrot', url: 'https://pierrot.jp', rss: null, tier: 1, weight: 8 },
    { name: 'Studio Colorido', url: 'https://studiocolorido.co.jp', rss: null, tier: 1, weight: 8 },
  ],
  
  // Publishers / Production Committees
  PUBLISHERS: [
    { name: 'Aniplex', url: 'https://www.aniplex.co.jp', rss: null, tier: 1, weight: 10 },
    { name: 'Kadokawa', url: 'https://www.kadokawa.co.jp', rss: 'https://www.kadokawa.co.jp/rss/', tier: 1, weight: 10 },
    { name: 'TOHO Animation', url: 'https://tohoanimation.jp', rss: null, tier: 1, weight: 9 },
    { name: 'Shueisha', url: 'https://www.shueisha.co.jp', rss: null, tier: 1, weight: 9 },
    { name: 'Kodansha', url: 'https://www.kodansha.co.jp', rss: null, tier: 1, weight: 9 },
    { name: 'Pony Canyon', url: 'https://www.ponycanyon.co.jp', rss: null, tier: 1, weight: 8 },
    { name: 'Avex Pictures', url: 'https://avex-pictures.co.jp', rss: null, tier: 1, weight: 8 },
    { name: 'Bandai Namco Filmworks', url: 'https://www.bandainamco-mirai-works.co.jp', rss: null, tier: 1, weight: 9 },
    { name: 'King Records', url: 'https://king-cr.jp', rss: null, tier: 1, weight: 8 },
    { name: 'NBCUniversal Anime', url: 'https://www.nbcuni.co.jp', rss: null, tier: 1, weight: 8 },
  ],
  
  // YouTube Channels (Official)
  YOUTUBE: [
    { name: 'MAPPA Official', channelId: 'UCZxsdzmU3OoC9Q8Z3swoS6g', tier: 1, weight: 10 },
    { name: 'Ufotable', channelId: 'UCgHfufyA9n6qMvo3K0XBp2w', tier: 1, weight: 10 },
    { name: 'A-1 Pictures', channelId: 'UC2xDictxIa66VdNG1PaIyQ', tier: 1, weight: 9 },
    { name: 'CloverWorks', channelId: 'UC3ryC1YkgR0eJ1O4C9jP-Q', tier: 1, weight: 9 },
    { name: 'Kyoto Animation', channelId: 'UCUmkp4PJ8sYsQEKy9S617Q', tier: 1, weight: 9 },
    { name: 'TOHO Animation', channelId: 'UCp8LObSyk0vZ02NF4_7PcWg', tier: 1, weight: 9 },
    { name: 'Aniplex', channelId: 'UC8ZxQ3yL9sT7y8m6h3Z7K2A', tier: 1, weight: 10 },
    { name: 'Kadokawa', channelId: 'UCqmNf2x0c3y9fL8F5xM1A9w', tier: 1, weight: 10 },
    { name: 'Bandai Namco', channelId: 'UCx9yYu1JkN3qC8s8zLjkI7w', tier: 1, weight: 9 },
  ]
};

// ============================================
// TIER 2 — VERIFIED NEWS DISTRIBUTORS
// ============================================

export const TIER_2_RSS_SOURCES = [
  // Core English Sources
  {
    name: 'AnimeNewsNetwork',
    url: 'https://www.animenewsnetwork.com/all/rss.xml',
    tier: 2,
    weight: 8,
    language: 'EN',
    checkInterval: 30,
    healthScore: 100
  },
  {
    name: 'MyAnimeList',
    url: 'https://myanimelist.net/rss/news.xml',
    tier: 2,
    weight: 7,
    language: 'EN',
    checkInterval: 30,
    healthScore: 100
  },
  {
    name: 'AnimeUKNews',
    url: 'https://animeuknews.net/feed/',
    tier: 2,
    weight: 6,
    language: 'EN',
    checkInterval: 30,
    healthScore: 100
  },
  {
    name: 'Anime Herald',
    url: 'https://www.animeherald.com/feed/',
    tier: 2,
    weight: 6,
    language: 'EN',
    checkInterval: 30,
    healthScore: 100
  },

  // Platform News
  {
    name: 'Crunchyroll News',
    url: 'https://cr-news-api-service.prd.crunchyrollsvc.com/v1/en-US/rss',
    tier: 2,
    weight: 7,
    language: 'EN',
    checkInterval: 30,
    healthScore: 100
  },
];

// ============================================
// TIER 3 — SIGNAL DETECTION (Validation Only)
// ============================================

export const TIER_3_SOURCES = {
  // Nitter Instances (rotating pool for reliability)
  NITTER_INSTANCES: [
    { url: 'https://nitter.net', health: 100, lastSuccess: null },
    { url: 'https://nitter.it', health: 100, lastSuccess: null },
    { url: 'https://nitter.cz', health: 100, lastSuccess: null },
    { url: 'https://nitter.privacydev.net', health: 100, lastSuccess: null },
  ],
  
  // Monitored X Accounts (via Nitter - Tier 3 validation only)
  MONITORED_ACCOUNTS: [
    { handle: 'Crunchyroll', name: 'Crunchyroll', tier: 1, weight: 5 },
    { handle: 'AniplexUSA', name: 'Aniplex', tier: 1, weight: 5 },
    { handle: 'MAPPA_Info', name: 'MAPPA', tier: 1, weight: 5 },
    { handle: 'kyoani', name: 'Kyoto Animation', tier: 1, weight: 5 },
    { handle: 'ufotable', name: 'Ufotable', tier: 1, weight: 5 },
    { handle: 'toho_animation', name: 'TOHO Animation', tier: 1, weight: 5 },
    { handle: 'KadokawaAnime', name: 'Kadokawa', tier: 1, weight: 5 },
    { handle: 'AnimeNewsNet', name: 'Anime News Network', tier: 2, weight: 4 },
    { handle: 'NetflixAnime', name: 'Netflix Anime', tier: 1, weight: 4 },
  ]
};

// ============================================
// CONTENT SCORING SYSTEM
// ============================================

export interface ContentScore {
  total: number;
  breakdown: {
    sourceAuthority: number;
    contentType: number;
    visualEvidence: number;
    temporalRelevance: number;
  };
  confidence: 'high' | 'medium' | 'low';
  publishThreshold: boolean;
}

// Positive signals (additive)
export const SCORING_WEIGHTS = {
  // Source Authority (+)
  OFFICIAL_STUDIO_SOURCE: 5,
  PUBLISHER_CONFIRMATION: 4,
  PLATFORM_VERIFICATION: 3,
  NEWS_DISTRIBUTOR: 2,
  SIGNAL_DETECTION: 1,
  
  // Content Type (+)
  TRAILER_VIDEO: 4,
  SEASON_CONFIRMATION: 4,
  KEY_VISUAL: 4,
  RELEASE_DATE: 4,
  CAST_STAFF_UPDATE: 2,
  PRODUCTION_NEWS: 2,
  
  // Visual Evidence (+)
  OFFICIAL_IMAGE: 2,
  KEY_VISUAL_IMAGE: 2,
  
  // Temporal Relevance (+)
  BREAKING_WITHIN_HOUR: 2,
  RECENT_WITHIN_DAY: 1,
};

// Negative signals (subtractive)
export const SCORING_PENALTIES = {
  MERCHANDISE_ONLY: -4,
  FIGURES_TOYS: -3,
  FAN_SPECULATION: -3,
  REPOST_DUPLICATE: -2,
  OFF_TOPIC: -2,
  STALE_NEWS: -2,
};

// Content signals (keywords that indicate quality)
export const QUALITY_SIGNALS = {
  HIGH_VALUE: [
    'trailer', 'pv', 'teaser', 'announcement', 'confirmed', 'revealed',
    'season 2', 'season 3', 'season 4', 'new season', 'sequel',
    'key visual', 'visual revealed', 'new visual',
    'release date', 'premiere', 'airing', 'broadcast',
    'production confirmed', 'greenlit', 'in production'
  ],
  
  MEDIUM_VALUE: [
    'cast', 'staff', 'director', 'studio', 'animation',
    'adaptation', 'manga adaptation', 'light novel adaptation',
    'streaming', 'simulcast', 'exclusively on'
  ],
  
  // NO LONGER AUTO-REJECT - these are valid industry signals
  CONTEXTUAL: [
    'manga', 'light novel', 'novel', 'adaptation'
  ]
};

// Thresholds
export const SCORING_THRESHOLDS = {
  PUBLISH_MINIMUM: 6,      // Score >= 6 → pending approval (raised from 4 to reduce noise)
  AUTO_REJECT: -2,         // Score < -2 → discard
  HIGH_CONFIDENCE: 7,      // Score >= 7 → high confidence
};

// ============================================
// SOURCE CONFIGURATION
// ============================================

export interface SourceConfig {
  name: string;
  tier: 1 | 2 | 3;
  weight: number;
  checkInterval: number; // minutes
  healthScore: number;
  lastCheck?: Date;
  consecutiveFailures: number;
  enabled: boolean;
}

export const DEFAULT_SOURCE_CONFIG: Record<string, SourceConfig> = {
  'AnimeNewsNetwork': {
    name: 'AnimeNewsNetwork',
    tier: 2,
    weight: 8,
    checkInterval: 10,
    healthScore: 100,
    consecutiveFailures: 0,
    enabled: true
  },
  'MyAnimeList': {
    name: 'MyAnimeList',
    tier: 2,
    weight: 7,
    checkInterval: 10,
    healthScore: 100,
    consecutiveFailures: 0,
    enabled: true
  },
  'YouTube_Tier1': {
    name: 'YouTube_Tier1',
    tier: 1,
    weight: 10,
    checkInterval: 10,
    healthScore: 100,
    consecutiveFailures: 0,
    enabled: true
  },
  'Nitter': {
    name: 'Nitter',
    tier: 3,
    weight: 2,
    checkInterval: 15,
    healthScore: 100,
    consecutiveFailures: 0,
    enabled: true
  }
};

// ============================================
// DEDUPLICATION CONFIGURATION
// ============================================

export const DEDUPLICATION_CONFIG = {
  // Time window for duplicate detection (hours)
  CHECK_WINDOW: 72,
  
  // Similarity threshold (0-1)
  SIMILARITY_THRESHOLD: 0.75,
  
  // Fields to compare
  FINGERPRINT_FIELDS: [
    'normalized_title',
    'canonical_url',
    'anime_id',
    'event_type'
  ],
  
  // Canonical source priority (lower = higher priority)
  SOURCE_PRIORITY: {
    'Official Studio': 1,
    'Publisher': 2,
    'ANN': 3,
    'MAL': 4,
    'Nitter': 5
  }
};

// ============================================
// RELIABILITY CONFIGURATION
// ============================================

export const RELIABILITY_CONFIG = {
  // Retry settings
  MAX_RETRIES: 3,
  RETRY_DELAY_BASE: 1000, // ms
  RETRY_DELAY_MAX: 10000, // ms
  
  // Health monitoring
  HEALTH_DECAY: 10,        // Points lost on failure
  HEALTH_RECOVERY: 5,      // Points gained on success
  HEALTH_THRESHOLD: 30,    // Disable source below this
  
  // Source skip settings
  SKIP_AFTER_FAILURES: 3,
  SKIP_DURATION_MINUTES: 30,
  
  // Nitter rotation
  NITTER_ROTATION_INTERVAL: 5, // minutes
  NITTER_TIMEOUT: 10000, // ms
};

// ============================================
// EXECUTION SCHEDULE
// ============================================

export const EXECUTION_SCHEDULE = {
  // Detection Worker (frequent, lightweight)
  DETECTION: {
    interval: 30, // minutes
    maxRuntime: 5, // minutes
    sources: ['RSS', 'YouTube', 'Nitter'],
  },
  
  // Processing Worker (hourly, heavy)
  PROCESSING: {
    interval: 60, // minutes
    maxRuntime: 30, // minutes
    tasks: ['enrichment', 'scoring', 'deduplication', 'approval_queue'],
  },
  
  // Daily Drops (once per day)
  DAILY_DROPS: {
    hour: 8, // 8 AM EST
    timezone: 'America/New_York'
  }
};

// Combined export for easy access
export const INTELLIGENCE_CONFIG = {
  TIER_1_SOURCES,
  TIER_2_RSS_SOURCES,
  TIER_3_SOURCES,
  SCORING_WEIGHTS,
  SCORING_PENALTIES,
  QUALITY_SIGNALS,
  SCORING_THRESHOLDS,
  DEDUPLICATION_CONFIG,
  RELIABILITY_CONFIG,
  EXECUTION_SCHEDULE
};
