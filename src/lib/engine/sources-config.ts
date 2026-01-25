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
        'Silver Link', 'Studio Colorido', 'Studio Ghibli'
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
        'Aniplex', 'Kadokawa', 'Shueisha', 'Shogakukan', 'Kodansha', 'Bushiroad',
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
        'New Anime', 'Announcement', 'Season 2', 'Season 3', 'Movie',
        'Key Visual', 'Trailer', 'PV', 'Broadcast Date', 'Premiere',
        'Delay', 'Postponed', 'Rescheduled'
    ],
    // Keywords strictly forbidden
    NEGATIVE_KEYWORDS: [
        'Manga', 'Novel', 'Light Novel', 'Merch', 'Figure', 'Cafe', 'Event',
        'Birthday', 'Cosplay', 'Game', 'Collaboration', 'Digest', 'Recap',
        'Interview', 'Goods', 'Blu-ray', 'DVD', 'Box Set', 'Staff', 'Cast'
    ]
};
