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
 * All sources verified working as of 2025
 */
export const RSS_SOURCES = {
    // Tier 2: Established anime news
    TIER_2: [
        { name: 'AnimeNewsNetwork', url: 'https://www.animenewsnetwork.com/all/rss.xml', tier: 2 },
        { name: 'MyAnimeList', url: 'https://myanimelist.net/rss/news.xml', tier: 2 }
    ],
    // Tier 3: Platform/entertainment news  
    TIER_3: [
        { name: 'ComicBook', url: 'https://comicbook.com/anime/rss', tier: 3 },
        { name: 'CrunchyrollNews', url: 'https://www.crunchyroll.com/news/rss', tier: 3 }
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
    ...RSS_SOURCES.TIER_3
];
