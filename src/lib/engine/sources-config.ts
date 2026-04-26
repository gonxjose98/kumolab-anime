/**
 * sources-config.ts
 * Strict source-of-truth configuration for KumoLab's sourcing engine.
 *
 * TIERS (Revised 2026-03-12):
 * T1: Auto-publish worthy — Major platforms & distributors with consistent, high-quality EN content
 * T2: High-quality but needs review — Publishers, committees, keyword-filtered sources
 * T3: Manual review only — Studio accounts (JP-heavy, inconsistent), niche platforms
 * T4: Databases (Validation Only)
 */

export const SOURCE_TIERS = {
    // T1: Major distributors/platforms — consistent EN announcements, auto-publish worthy
    TIER_1_PLATFORMS: [
        'Crunchyroll',       // Primary EN anime platform
        'NetflixAnime',      // Netflix Anime (EN)
        'AniplexUSA',        // Aniplex USA (EN distributor)
        'TOHOanimation',     // TOHO Animation (major distributor)
    ],
    TIER_1_NAMES: [
        'Crunchyroll', 'Netflix Anime', 'Aniplex USA', 'TOHO Animation'
    ],
    // T2: Publishers & committees — good content but needs review or keyword filtering
    TIER_2_COMMITTEES: [
        'kadokawa_anime',    // Kadokawa
        'SHUEISHA_PR',       // Shueisha
        'ShoProWorld',       // Shogakukan-Shueisha
        'KodanshaManga',     // Kodansha
        'pony_canyon',       // Pony Canyon (EN-only filter recommended)
        'VIZMedia',          // Viz Media (keyword-filtered: "anime trailer", "anime")
        'bushiroad_global',  // Bushiroad
        'avex_anime_pr',     // Avex
        'NBCUniversal',      // NBCUniversal Japan
        'KingRecords',       // King Records
        'SquareEnix',        // Square Enix
        'fujitv_anime',      // Fuji TV
        'TVTOKYO_anime',     // TV Tokyo
    ],
    TIER_2_NAMES: [
        'Kadokawa', 'Shueisha', 'Shogakukan', 'Kodansha', 'Viz Media',
        'Pony Canyon', 'Bushiroad', 'Avex', 'NBCUniversal', 'King Records',
        'Square Enix', 'Fuji TV', 'TV Tokyo'
    ],
    // T3: Studio accounts — manual review only (JP-heavy, inconsistent quality)
    TIER_3_STUDIOS: [
        'MAPPA_Info',        // MAPPA
        'ufotable',          // Ufotable
        'a1pictures',        // A-1 Pictures
        'CloverWorks_HQ',    // CloverWorks
        'ToeiAnimation',     // Toei Animation
        'bones_inc',         // Bones
        'Madhouse_News',     // Madhouse
        'kyoani',            // Kyoto Animation
        'ProductionIG',      // Production I.G
        'WIT_STUDIO',        // Wit Studio
        'trigger_inc',       // Trigger
        'Sunrise_Inc',       // Sunrise / Bandai Namco Filmworks
        'st_pierrot',        // Pierrot
        'sciencesaru',       // Science SARU
        'silverlink',        // Silver Link
        'studiocolorido',    // Studio Colorido
        'JP_GHIBLI',         // Studio Ghibli
    ],
    TIER_3_NAMES: [
        'MAPPA', 'Toei Animation', 'Bones', 'Madhouse', 'A-1 Pictures', 'CloverWorks',
        'Ufotable', 'Kyoto Animation', 'Production I.G', 'Wit Studio', 'Trigger',
        'Sunrise', 'Bandai Namco Filmworks', 'Pierrot', 'Science SARU',
        'Silver Link', 'Studio Colorido', 'Studio Ghibli'
    ],
    // T4: Databases — validation/cross-reference only
    TIER_4_DATABASES: [
        'AniList', 'MyAnimeList'
    ]
};

export const ANILIST_VALIDATION_ONLY = true;

export const CONTENT_RULES = {
    // Keywords that strongly suggest newsworthy anime content (case-insensitive matching)
    POSITIVE_KEYWORDS: [
        // Announcements
        'announcement', 'announces', 'confirmed', 'greenlit', 'reveals',
        // Seasons & sequels
        'season 2', 'season 3', 'season 4', 'season 5',
        '2nd season', '3rd season', '4th season', '5th season', 'final season',
        'sequel', 'new anime',
        // Media releases
        'trailer', 'teaser', 'pv', 'key visual', 'new visual',
        // Scheduling
        'premiere', 'broadcast date', 'coming to', 'streaming',
        'delay', 'postponed', 'rescheduled',
        // Production
        'movie', 'film', 'production',
    ],
    // Keywords that indicate non-newsworthy content — auto-reject
    NEGATIVE_KEYWORDS: [
        'birthday', 'cafe', 'merch', 'figure', 'goods', 'collaboration',
        'blu-ray', 'dvd', 'box set', 'interview', 'behind the scenes',
        'event', 'mario', 'concert', 'live event', 'pop-up shop',
        'giveaway', 'sweepstakes', 'contest', 'quiz', 'poll',
        'wallpaper', 'ringtone', 'sticker', 'emoji',
        'cosplay', 'review', 'opinion', 'ranking', 'top 10', 'best anime',
    ],
    // Content categories to exclude (for RSS filtering)
    EXCLUDE_CATEGORIES: [
        'manga', 'light novel', 'novel', 'live-action', 'live action',
        'webtoon', 'manhwa', 'comic', 'book', 'movie review',
        'cosplay', 'convention',
    ],
    // Keyword filter for sources that need it (e.g., Viz Media)
    // Only accept content matching these terms from keyword-filtered sources
    KEYWORD_FILTER_REQUIRED: [
        'anime', 'anime trailer', 'trailer', 'pv', 'teaser',
        'season', 'premiere', 'announcement', 'streaming',
    ],
};

/**
 * FREE RSS SOURCES — No API costs
 *
 * Revised 2026-03-12:
 * T1: MAL News (reliable, EN, high-quality aggregation)
 * T2: ANN (keyword-filtered), Natalie.mu, Oricon (JP primary)
 * T3: OtakuNews, Anime UK News, MANTAN Web (supplementary)
 */
export const RSS_SOURCES = {
    TIER_1: [
        { name: 'MyAnimeList News', url: 'https://myanimelist.net/rss/news.xml', tier: 1 },
    ],
    TIER_2: [
        { name: 'AnimeNewsNetwork', url: 'https://www.animenewsnetwork.com/all/rss.xml', tier: 2, keywordFiltered: true },
    ],
    TIER_3: [
        { name: 'OtakuNews', url: 'https://www.otakunews.com/rss/rss.xml', tier: 3 },
        { name: 'Anime UK News', url: 'https://animeuknews.net/feed/', tier: 3 },
    ],
};

/**
 * YOUTUBE CHANNELS — Free RSS via ytimg feeds
 * Monitor for trailer drops, PVs, announcements
 * Format: https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
 *
 * Revised 2026-04-26: replaced the entire previous list — most prior IDs were
 * unverified and never resolved (all 11 channels had consecutive_failures=16,
 * last_success=NULL). Resolved every ID below by fetching the channel's
 * @handle page and reading the canonical channelMetadataRenderer.
 *
 * All official-studio + distributor channels are promoted to T1 because:
 *   1. The `isT1YouTube` shortcut in auto-approval.ts auto-publishes any
 *      T1 YouTube candidate with score ≥ 7 — and the visual-artifact gate
 *      already guarantees the video actually exists. A studio uploading a
 *      trailer to its own channel is evidence by existence; corroboration
 *      adds nothing.
 *   2. Anything below T1 routes to manual review per CLAIM_RISK_BY_TIER,
 *      which contradicts Jose's directive that videos auto-publish without
 *      manual touch.
 * Add new channels via the same path: fetch the @handle, copy the channelId
 * from the page metadata.
 */
export const YOUTUBE_STUDIO_CHANNELS = {
    // Tier 1: All verified official channels — auto-publish path
    TIER_1: [
        { name: 'Crunchyroll', channelId: 'UC6pGDc4bFGD1_36IKv3FnYg', tier: 1 },
        { name: 'Netflix Anime', channelId: 'UCBSs9x2KzSLhyyA9IKyt4YA', tier: 1 },
        { name: 'Aniplex USA', channelId: 'UCDb0peSmF5rLX7BvuTcJfCw', tier: 1 },
        { name: 'TOHO Animation', channelId: 'UC14Yc2Qv92DMuyNRlHvpo2Q', tier: 1 },
        { name: 'MAPPA', channelId: 'UCgQwnbMmPDQOcj0jMR-ZeWg', tier: 1 },
        { name: 'Kadokawa', channelId: 'UCY5fcqgSrQItPAX_Z5Frmwg', tier: 1 },
        { name: 'A-1 Pictures', channelId: 'UCUN7jFL7lnSia_NbzTrx4ow', tier: 1 },
        { name: 'Viz Media', channelId: 'UCV1da9peoqEwqr45bpTJsbQ', tier: 1 },
        { name: 'CloverWorks', channelId: 'UCCT6fRG8poit5j_GOE4Hrhw', tier: 1 },
        { name: 'Pony Canyon', channelId: 'UCk0IUODXaAFr5gEFlZDbzmw', tier: 1 },
    ],
    TIER_2: [] as { name: string; channelId: string; tier: number }[],
    TIER_3: [] as { name: string; channelId: string; tier: number }[],
    // Tier 4: Franchise channels — add verified IDs via admin Connections panel
    TIER_4: [] as { name: string; channelId: string; tier: number }[]
};

/**
 * Combined source list for iteration
 */
export const ALL_RSS_SOURCES = [
    ...RSS_SOURCES.TIER_1,
    ...RSS_SOURCES.TIER_2,
    ...RSS_SOURCES.TIER_3,
];

// ============================================================
// ACCURACY-FIRST CONTENT TIER SYSTEM
// ============================================================

/**
 * VERIFICATION TIERS — Authority Score 0-100
 * Visual trust indicators for content
 */
export const VERIFICATION_TIERS = {
    /** 95-100: Studio/Publisher confirmed via multiple sources */
    VERIFIED_PRIMARY: {
        score: 95,
        badge: '🔴 VERIFIED PRIMARY',
        color: '#ef4444', // red-500
        description: 'Studio/Publisher confirmed via multiple sources'
    },
    /** 80-94: Two+ independent T2+ sources align */
    CONFIRMED: {
        score: 85,
        badge: '🟡 CONFIRMED',
        color: '#eab308', // yellow-500
        description: 'Two+ independent sources confirm'
    },
    /** 65-79: Official website or single T1 source */
    OFFICIAL: {
        score: 75,
        badge: '🟠 OFFICIAL',
        color: '#f97316', // orange-500
        description: 'Official source or single T1 confirmation'
    },
    /** 50-64: Licensed platform or T2 source */
    PLATFORM_VERIFIED: {
        score: 60,
        badge: '🟢 PLATFORM',
        color: '#22c55e', // green-500
        description: 'Licensed platform or publisher source'
    },
    /** 30-49: Database/community trending */
    TRENDING: {
        score: 40,
        badge: '🔵 TRENDING',
        color: '#3b82f6', // blue-500
        description: 'Community buzz, verification in progress'
    },
    /** <30: Single source, awaiting confirmation */
    REPORTED: {
        score: 20,
        badge: '⚪ REPORTED',
        color: '#9ca3af', // gray-400
        description: 'Single source, awaiting confirmation'
    }
};

/**
 * Get verification tier based on source tier and cross-reference count
 */
export function getVerificationTier(sourceTier: number, crossRefCount: number = 0): keyof typeof VERIFICATION_TIERS {
    if (sourceTier === 1 && crossRefCount >= 1) return 'VERIFIED_PRIMARY';
    if (sourceTier <= 2 && crossRefCount >= 2) return 'CONFIRMED';
    if (sourceTier === 1 || crossRefCount >= 1) return 'OFFICIAL';
    if (sourceTier <= 3) return 'PLATFORM_VERIFIED';
    if (sourceTier <= 4) return 'TRENDING';
    return 'REPORTED';
}

/**
 * CONTENT TYPE CLASSIFICATION
 * What gets auto-posted vs what needs review
 */
export const CONTENT_CLASSIFICATION = {
    /** Breaking: Studio/Publisher Direct — Auto-post with verification badge */
    BREAKING: {
        minTier: 1,
        maxTier: 2,
        requiredKeywords: ['confirmed', 'announces', 'reveals', 'trailer', 'pv'],
        autoPost: true,
        humanReview: false,
        priority: 'immediate'
    },
    /** Season Confirmations — Must have T1-T2 source */
    SEASON_CONFIRMATION: {
        claimTypes: ['NEW_SEASON_CONFIRMED'],
        minTier: 1,
        maxTier: 2,
        autoPost: false,
        humanReview: true,
        priority: 'high'
    },
    /** Release Dates — T2+ required, 24hr review window */
    RELEASE_DATE: {
        claimTypes: ['DATE_ANNOUNCED'],
        minTier: 2,
        maxTier: 4,
        autoPost: false,
        humanReview: true,
        priority: 'medium'
    },
    /** Delays/Postponements — T1-T4 allowed, immediate */
    DELAY: {
        claimTypes: ['DELAY'],
        minTier: 1,
        maxTier: 4,
        autoPost: true,
        humanReview: false,
        priority: 'immediate'
    },
    /** Trailers/PVs — T2+ required, check if official */
    TRAILER: {
        claimTypes: ['TRAILER_DROP'],
        minTier: 2,
        maxTier: 3,
        autoPost: false,
        humanReview: true,
        priority: 'high'
    },
    /** Visual Reveals — T2+ required */
    VISUAL: {
        claimTypes: ['NEW_KEY_VISUAL'],
        minTier: 2,
        maxTier: 3,
        autoPost: false,
        humanReview: true,
        priority: 'medium'
    },
    /** Daily Drops — T4 verified, auto at 8am */
    DAILY_DROPS: {
        type: 'DROP',
        minTier: 4,
        requiresStreamerLink: true,
        autoPost: true,
        humanReview: false,
        priority: 'scheduled'
    },
    /** Trending — T5+ allowed, daily digest only */
    TRENDING: {
        claimTypes: ['TRENDING_UPDATE'],
        minTier: 5,
        autoPost: false,
        humanReview: true,
        priority: 'low',
        digestOnly: true
    }
};

/**
 * Calculate content classification for a post
 */
export function classifyContent(claimType: string, sourceTier: number, hasStreamerLink: boolean = false) {
    // Check each classification rule
    for (const [key, rule] of Object.entries(CONTENT_CLASSIFICATION)) {
        // Check claim type rules
        if ('claimTypes' in rule && rule.claimTypes?.includes(claimType as any)) {
            if (sourceTier >= rule.minTier) {
                const maxTier = 'maxTier' in rule ? rule.maxTier : 6;
                if (sourceTier <= (maxTier || 6)) {
                    return { classification: key, ...rule };
                }
            }
        }
        // Check special rules (BREAKING with keywords)
        if ('requiredKeywords' in rule && rule.requiredKeywords) {
            // BREAKING classification handled separately
            continue;
        }
        // Check Daily Drops
        if ('type' in rule && rule.type === 'DROP' && claimType === 'DROP') {
            const requiresLink = 'requiresStreamerLink' in rule ? rule.requiresStreamerLink : false;
            if (hasStreamerLink || !requiresLink) {
                return { classification: key, ...rule };
            }
        }
    }
    
    // Default: needs human review
    return {
        classification: 'STANDARD',
        autoPost: false,
        humanReview: true,
        priority: 'low'
    };
}
