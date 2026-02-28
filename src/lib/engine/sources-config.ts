/**
 * sources-config.ts
 * strict strict source-of-truth configuration for KumoLab's sourcing engine.
 * 
 * TIERS:
 * 1. Official Origin (Studios)
 * 2. Committees/Publishers (Speed Layer)
 * 3. Official Anime Websites (Source of Truth)
 * 4. Licensors/Streaming Platforms (Verification)
 * 5. Databases (Validation Only)
 */

export const SOURCE_TIERS = {
    TIER_1_STUDIOS: [
        'MAPPA_Info', // MAPPA
        'ToeiAnimation', // Toei Animation
        'bones_inc', // Bones
        'Madhouse_News', // Madhouse
        'a1pictures', // A-1 Pictures
        'CloverWorks_HQ', // CloverWorks
        'ufotable', // Ufotable
        'kyoani', // Kyoto Animation
        'ProductionIG', // Production I.G
        'WIT_STUDIO', // Wit Studio
        'trigger_inc', // Trigger
        'Sunrise_Inc', // Sunrise / Bandai Namco Filmworks
        'OLM_Release', // OLM (Need to verify handle, using plausible placeholder or ID)
        'st_pierrot', // Pierrot
        'd_visual', // David Production (Placeholder, strict handle needed)
        'sciencesaru', // Science SARU
        'silverlink', // Silver Link
        'studiocolorido', // Studio Colorido
        'JP_GHIBLI' // Studio Ghibli
    ],
    // For RSS/Text Matching:
    TIER_1_NAMES: [
        'MAPPA', 'Toei Animation', 'Bones', 'Madhouse', 'A-1 Pictures', 'CloverWorks',
        'Ufotable', 'Kyoto Animation', 'Production I.G', 'Wit Studio', 'Trigger',
        'Sunrise', 'Bandai Namco Filmworks', 'OLM', 'Pierrot', 'Studio Deen',
        'TMS Entertainment', 'LIDENFILMS', 'David Production', 'Science SARU',
        'Silver Link', 'Studio Colorido', 'Studio Ghibli', 'Aniplex'
    ],
    TIER_2_COMMITTEES: [
        'aniplex_exclusive', 'aniplexJB', // Aniplex
        'kadokawa_anime', // Kadokawa
        'SHUEISHA_PR', // Shueisha
        'ShoProWorld', // Shogakukan-Shueisha
        'KodanshaManga', // Kodansha
        'bushiroad_global', // Bushiroad
        'avex_anime_pr', // Avex
        'pony_canyon', // Pony Canyon
        'NBCUniversal', // NBCUniversal Japan
        'KingRecords', // King Records
        'TOHOanimation', // TOHO
        'bnam_jp', // Bandai Namco
        'SquareEnix', // Square Enix
        'fujitv_anime', // Fuji TV
        'TVTOKYO_anime' // TV Tokyo
    ],
    TIER_2_NAMES: [
        'Kadokawa', 'Shueisha', 'Shogakukan', 'Kodansha', 'Bushiroad',
        'Avex', 'Pony Canyon', 'NBCUniversal', 'King Records', 'TOHO Animation',
        'Bandai Namco', 'Square Enix', 'Fuji TV', 'TV Tokyo'
    ],
    TIER_4_PLATFORMS: [
        'Crunchyroll',
        'NetflixAnime',
        'HIDIVEofficial',
        'DisneyPlusJP',
        'PrimeVideo_JP'
    ]
};

export const ANILIST_VALIDATION_ONLY = true;

export const CONTENT_RULES = {
    // Keywords that strongly suggest 'Important' content
    POSITIVE_KEYWORDS: [
        'New Anime', 'Announcement', 'Season 2', 'Season 3', 'Season 4', 'Season 5',
        '2nd Season', '3rd Season', '4th Season', '5th Season', 'Final Season',
        'Movie', 'Key Visual', 'Trailer', 'PV', 'Broadcast Date', 'Premiere',
        'Delay', 'Postponed', 'Rescheduled', 'Confirmed', 'Annihilated', 'Greenlit',
        'Production', 'Sequel', 'New Visual', 'Streaming', 'Teaser'
    ],
    // Keywords strictly forbidden
    NEGATIVE_KEYWORDS: [
        'Birthday', 'Cafe', 'Merch', 'Figure', 'Goods', 'Collaboration',
        'Blu-ray', 'DVD', 'Box Set', 'Interview', 'Event', 'Mario', 'AI'
    ],
    // Content categories to exclude (for RSS filtering)
    EXCLUDE_CATEGORIES: [
        'manga', 'light novel', 'novel', 'live-action', 'live action', 
        'webtoon', 'manhwa', 'comic', 'book', 'movie review'
    ]
};

/**
 * FREE RSS SOURCES — Tier 2-4 quality, no API costs
 * 
 * Last verified: 2026-02-27
 * - ANN: 195 items ✅
 * - OtakuNews: 50 items ✅
 * - MAL: 20 items ✅
 * - ComicBook: 0 items ❌ (dead)
 * - Crunchyroll: 0 items ❌ (dead)
 */
export const RSS_SOURCES = {
    // Tier 2: Established anime news (verified working)
    TIER_2: [
        { name: 'AnimeNewsNetwork', url: 'https://www.animenewsnetwork.com/all/rss.xml', tier: 2 },
        { name: 'MyAnimeList', url: 'https://myanimelist.net/rss/news.xml', tier: 2 },
        { name: 'OtakuNews', url: 'https://www.otakunews.com/rss/rss.xml', tier: 2 }
    ],
    // Tier 3: Platform/entertainment news (currently no working sources)
    TIER_3: [
        // Sources disabled - returning empty/broken
        // { name: 'ComicBook', url: 'https://comicbook.com/anime/rss', tier: 3 },
        // { name: 'CrunchyrollNews', url: 'https://www.crunchyroll.com/news/rss', tier: 3 }
    ],
    // Tier 1: Japanese primary sources (earlier news, requires translation)
    TIER_1_JP: [
        { name: 'Natalie.mu', url: 'https://natalie.mu/comic/feed/news', tier: 1 },
        { name: 'Oricon Anime', url: 'https://www.oricon.co.jp/rss/news_anime.xml', tier: 1 }
    ]
};

/**
 * YOUTUBE STUDIO CHANNELS — Free RSS via ytimg feeds
 * Monitor for trailer drops, PVs, announcements
 * Format: https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
 */
export const YOUTUBE_STUDIO_CHANNELS = {
    // Tier 1: Major studios (when they post trailers, it's official)
    TIER_1: [
        { name: 'MAPPA', channelId: 'UCZxsdzmU3OoC9Q8Z3swoS6g', tier: 1 },
        { name: 'Ufotable', channelId: 'UCgHfufyA9n6qMvo3K0XBp2w', tier: 1 },
        { name: 'A1Pictures', channelId: 'UC2xDictxIa66VdNG1PaIyQ', tier: 1 },
        { name: 'ToeiAnimation', channelId: 'UCx9yYu1JkN3qC8s8zLjkI7w', tier: 1 },
        { name: 'CloverWorks', channelId: 'UC3ryC1YkgR0eJ1O4C9jP-Q', tier: 1 },
        { name: 'KyotoAnimation', channelId: 'UCUmkp4PJ8sYsQEKy9S617Q', tier: 1 }
    ],
    // Tier 2: Publishers & committees
    TIER_2: [
        { name: 'Aniplex', channelId: 'UC8ZxQ3yL9sT7y8m6h3Z7K2A', tier: 2 },
        { name: 'Kadokawa', channelId: 'UCqmNf2x0c3y9fL8F5xM1A9w', tier: 2 }
    ]
};

/**
 * Combined source list for iteration
 */
export const ALL_RSS_SOURCES = [
    ...RSS_SOURCES.TIER_2,
    ...RSS_SOURCES.TIER_3,
    ...(RSS_SOURCES.TIER_1_JP || [])
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
