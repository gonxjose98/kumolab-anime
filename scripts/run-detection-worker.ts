/**
 * Standalone Detection Worker Runner
 * Executed via GitHub Actions every 10 minutes
 */

import { createClient } from '@supabase/supabase-js';

// Supabase configuration - MUST be set in environment
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

console.log('[Worker] Starting...');
console.log('[Worker] SUPABASE_URL:', SUPABASE_URL ? `set (${SUPABASE_URL.slice(0, 20)}...)` : 'MISSING');
console.log('[Worker] SUPABASE_KEY:', SUPABASE_KEY ? `set (${SUPABASE_KEY.slice(0, 10)}...)` : 'MISSING');

// Validate environment before creating client
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ FATAL: Missing required environment variables');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Lock configuration
const LOCK_ID = 'detection_worker_lock';
const LOCK_DURATION_MS = 5 * 60 * 1000;

// RSS Sources - all Tier 1+2 sources
const RSS_SOURCES = [
    // Tier 2: English
    { name: 'AnimeNewsNetwork', url: 'https://www.animenewsnetwork.com/all/rss.xml', tier: 2 },
    { name: 'MyAnimeList', url: 'https://myanimelist.net/rss/news.xml', tier: 2 },
    { name: 'Crunchyroll', url: 'https://cr-news-api-service.prd.crunchyrollsvc.com/v1/en-US/rss', tier: 2 },
    { name: 'AnimeUKNews', url: 'https://animeuknews.net/feed/', tier: 2 },
    { name: 'AnimeHerald', url: 'https://www.animeherald.com/feed/', tier: 2 },
    // Tier 1: Japanese primary
    { name: 'Natalie', url: 'https://natalie.mu/comic/feed/news', tier: 1 },
    { name: 'Oricon', url: 'https://www.oricon.co.jp/rss/news_anime.xml', tier: 1 },
    { name: 'MantanWeb', url: 'https://mantan-web.jp/rss.xml', tier: 2 },
];

// YouTube channels to scan via RSS (free, no API quota)
const YOUTUBE_CHANNELS = [
    { id: 'UCjfAEJZdfbIjVHdo5yODfyQ', name: 'MAPPA' },
    { id: 'UCRc3mprfrE8qaugB1VfQXiA', name: 'Ufotable' },
    { id: 'UC14Yc2Qv92DMuyNRlHvpo2Q', name: 'TOHO Animation' },
    { id: 'UCDb0peSmF5rLX7BvuTcJfCw', name: 'Aniplex' },
];

// YouTube Data API channels (uses quota — limited to 2 calls per run)
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const YOUTUBE_API_CHANNELS = [
    { id: 'UCZxsdzmU3OoC9Q8Z3swoS6g', name: 'MAPPA Official' },
    { id: 'UCgHfufyA9n6qMvo3K0XBp2w', name: 'Ufotable' },
    { id: 'UCp8LObSyk0vZ02NF4_7PcWg', name: 'TOHO Animation' },
    { id: 'UC2xDictxIa66VdNG1PaIyQ', name: 'A-1 Pictures' },
    { id: 'UC3ryC1YkgR0eJ1O4C9jP-Q', name: 'CloverWorks' },
    { id: 'UCqmNf2x0c3y9fL8F5xM1A9w', name: 'Kadokawa' },
];

/**
 * Simple RSS fetch
 */
async function fetchRSS(url: string): Promise<string | null> {
    console.log(`[Worker] Fetching: ${url}`);
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'KumoLab-DetectionWorker/1.0' },
            signal: AbortSignal.timeout(15000)
        });
        console.log(`[Worker] Response status: ${response.status}`);
        if (!response.ok) {
            console.log(`[Worker] Failed with status: ${response.status}`);
            return null;
        }
        const text = await response.text();
        console.log(`[Worker] Fetched ${text.length} bytes`);
        return text;
    } catch (e: any) {
        console.error(`[Worker] Fetch error:`, e.message);
        return null;
    }
}

/**
 * Parse RSS items — extracts images from description, enclosure, and media:content
 */
function parseRSS(xml: string, sourceName: string): any[] {
    const items = [];
    const itemRegex = /<item>[\s\S]*?<\/item>/g;
    const entryRegex = /<entry>[\s\S]*?<\/entry>/g;
    const matches = xml.match(itemRegex) || xml.match(entryRegex) || [];
    console.log(`[Worker] Found ${matches.length} items in ${sourceName} feed`);

    for (const item of matches.slice(0, 10)) {
        const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
        const linkMatch = item.match(/<link[^>]*href="([^"]+)"/) || item.match(/<link>(.*?)<\/link>/);
        const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/) || item.match(/<published>(.*?)<\/published>/) || item.match(/<updated>(.*?)<\/updated>/);
        const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) ||
                          item.match(/<summary>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/) ||
                          item.match(/<content[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/content/);

        const title = titleMatch?.[1]?.trim() || '';
        const link = linkMatch?.[1]?.trim() || '';
        const pubDate = pubDateMatch?.[1] || '';
        const desc = descMatch?.[1] || '';

        if (!title || !link) continue;

        // Extract images from description HTML, enclosure, and media:content
        const mediaUrls: string[] = [];
        const imgRegex = /<img[^>]+src="([^"]+)"/g;
        let imgMatch;
        while ((imgMatch = imgRegex.exec(item)) !== null) {
            if (!imgMatch[1].includes('tracking') && !imgMatch[1].includes('pixel'))
                mediaUrls.push(imgMatch[1]);
        }
        const enclosureMatch = item.match(/<enclosure[^>]+url="([^"]+)"/);
        if (enclosureMatch) mediaUrls.push(enclosureMatch[1]);
        const mediaMatch = item.match(/<media:content[^>]+url="([^"]+)"/);
        if (mediaMatch) mediaUrls.push(mediaMatch[1]);
        const mediaThumbnail = item.match(/<media:thumbnail[^>]+url="([^"]+)"/);
        if (mediaThumbnail) mediaUrls.push(mediaThumbnail[1]);

        items.push({
            source_name: sourceName,
            source_tier: 2,
            source_url: link,
            title: title.substring(0, 200),
            content: desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 1000),
            detected_at: new Date().toISOString(),
            original_timestamp: pubDate ? new Date(pubDate).toISOString() : null,
            media_urls: mediaUrls.slice(0, 5),
            extraction_method: 'RSS',
            status: 'pending_processing',
            fingerprint: `${sourceName}_${Buffer.from(link).toString('base64').slice(0, 20)}`
        });
    }
    return items;
}

/**
 * Check for duplicates
 */
async function isDuplicate(fingerprint: string, url: string): Promise<boolean> {
    const { data, error } = await supabase
        .from('detection_candidates')
        .select('id')
        .or(`fingerprint.eq.${fingerprint},source_url.eq.${url}`)
        .limit(1);
    
    if (error) {
        console.error('[Worker] Duplicate check error:', error);
        return false;
    }
    return data && data.length > 0;
}

/**
 * Acquire lock
 */
async function acquireLock(): Promise<boolean> {
    console.log('[Worker] Checking lock...');
    try {
        const { data: existing, error: fetchError } = await supabase
            .from('worker_locks')
            .select('*')
            .eq('lock_id', LOCK_ID)
            .single();
        
        if (fetchError && fetchError.code !== 'PGRST116') {
            console.error('[Worker] Lock fetch error:', fetchError);
        }
        
        if (existing) {
            const age = Date.now() - new Date(existing.acquired_at).getTime();
            console.log(`[Worker] Found existing lock, age: ${age}ms`);
            if (age < LOCK_DURATION_MS) {
                console.log('[Worker] Lock active, skipping...');
                return false;
            }
            console.log('[Worker] Lock expired, releasing...');
            await supabase.from('worker_locks').delete().eq('lock_id', LOCK_ID);
        }
        
        const { error: insertError } = await supabase.from('worker_locks').insert({
            lock_id: LOCK_ID,
            acquired_at: new Date().toISOString(),
            process_id: process.env.GITHUB_RUN_ID || 'local',
            hostname: 'github-actions'
        });
        
        if (insertError) {
            console.error('[Worker] Lock insert error:', insertError);
            return false;
        }
        
        console.log('[Worker] Lock acquired');
        return true;
    } catch (e: any) {
        console.error('[Worker] Lock error:', e.message);
        return false;
    }
}

/**
 * Release lock
 */
async function releaseLock(): Promise<void> {
    console.log('[Worker] Releasing lock...');
    await supabase.from('worker_locks').delete().eq('lock_id', LOCK_ID);
}

/**
 * Scan YouTube via RSS feeds (free, no quota)
 */
async function scanYouTubeRSS(): Promise<any[]> {
    const candidates = [];
    const animeKeywords = ['trailer', 'pv', 'teaser', 'announcement', 'preview', 'key visual',
        'opening', 'ending', 'cm', 'season', 'episode', 'anime', 'release', 'broadcast', '予告', 'ティザー', 'アニメ'];

    for (const channel of YOUTUBE_CHANNELS) {
        try {
            const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`;
            const xml = await fetchRSS(rssUrl);
            if (!xml) continue;

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

                if (!animeKeywords.some(kw => title.toLowerCase().includes(kw.toLowerCase()))) continue;

                candidates.push({
                    source_name: `YouTube_${channel.name}`,
                    source_tier: 1,
                    source_url: `https://youtube.com/watch?v=${videoId}`,
                    title: title.substring(0, 200),
                    content: `Official upload from ${channel.name}`,
                    detected_at: new Date().toISOString(),
                    original_timestamp: publishedAt || null,
                    media_urls: [`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`],
                    extraction_method: 'YouTube',
                    status: 'pending_processing',
                    fingerprint: `yt_${videoId}`,
                    metadata: { video_id: videoId, channel_name: channel.name },
                });
            }
            console.log(`[Worker] YouTube RSS ${channel.name}: scanned`);
        } catch (e: any) {
            console.error(`[Worker] YouTube RSS ${channel.name} error:`, e.message);
        }
    }
    return candidates;
}

/**
 * Scan YouTube via Data API (uses quota — limited to 2 channels per run, rotating)
 * Costs: 100 units per search.list call. Daily quota: 10,000 units.
 * At 2 calls per run × ~144 runs/day = 288 calls = 28,800 units (over)
 * So we rotate: pick 2 random channels per run = ~288 units/day (safe)
 */
async function scanYouTubeAPI(): Promise<any[]> {
    if (!YOUTUBE_API_KEY) {
        console.log('[Worker] YouTube API key not set, skipping API scan');
        return [];
    }

    const candidates = [];
    // Pick 2 random channels to scan this run (quota-friendly rotation)
    const shuffled = [...YOUTUBE_API_CHANNELS].sort(() => Math.random() - 0.5);
    const toScan = shuffled.slice(0, 2);

    for (const channel of toScan) {
        try {
            const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channel.id}&order=date&maxResults=5&type=video&publishedAfter=${new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()}&key=${YOUTUBE_API_KEY}`;
            const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (!response.ok) {
                console.log(`[Worker] YouTube API ${channel.name}: HTTP ${response.status}`);
                continue;
            }
            const data = await response.json();
            if (!data.items?.length) continue;

            for (const video of data.items) {
                const title = video.snippet?.title || '';
                const videoId = video.id?.videoId || '';
                if (!title || !videoId) continue;

                candidates.push({
                    source_name: `YouTube_API_${channel.name}`,
                    source_tier: 1,
                    source_url: `https://youtube.com/watch?v=${videoId}`,
                    title: title.substring(0, 200),
                    content: (video.snippet?.description || '').substring(0, 1000),
                    detected_at: new Date().toISOString(),
                    original_timestamp: video.snippet?.publishedAt || null,
                    media_urls: [
                        video.snippet?.thumbnails?.maxres?.url || video.snippet?.thumbnails?.high?.url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
                    ],
                    extraction_method: 'YouTube',
                    status: 'pending_processing',
                    fingerprint: `yt_${videoId}`,
                    metadata: { video_id: videoId, channel_name: channel.name, via: 'api' },
                });
            }
            console.log(`[Worker] YouTube API ${channel.name}: ${data.items.length} videos`);
        } catch (e: any) {
            console.error(`[Worker] YouTube API ${channel.name} error:`, e.message);
        }
    }
    return candidates;
}

/**
 * Main detection worker
 */
async function runDetection(): Promise<{saved: number, total: number}> {
    console.log('[Worker] Starting detection...');

    const allCandidates = [];

    // 1. Fetch RSS feeds
    for (const source of RSS_SOURCES) {
        console.log(`[Worker] Processing ${source.name}...`);
        const xml = await fetchRSS(source.url);
        if (xml) {
            const items = parseRSS(xml, source.name);
            allCandidates.push(...items);
            console.log(`[Worker] ${source.name}: ${items.length} items parsed`);
        } else {
            console.log(`[Worker] ${source.name}: Failed to fetch`);
        }
    }

    // 2. YouTube RSS (free, unlimited)
    console.log('[Worker] Scanning YouTube RSS feeds...');
    const ytRSS = await scanYouTubeRSS();
    allCandidates.push(...ytRSS);
    console.log(`[Worker] YouTube RSS: ${ytRSS.length} candidates`);

    // 3. YouTube Data API (quota-limited, 2 channels per run)
    console.log('[Worker] Scanning YouTube API (2 channels)...');
    const ytAPI = await scanYouTubeAPI();
    allCandidates.push(...ytAPI);
    console.log(`[Worker] YouTube API: ${ytAPI.length} candidates`);

    console.log(`[Worker] Total candidates: ${allCandidates.length}`);

    // Save to database
    let saved = 0;
    let duplicates = 0;
    for (const candidate of allCandidates) {
        const isDup = await isDuplicate(candidate.fingerprint, candidate.source_url);
        if (isDup) {
            duplicates++;
            continue;
        }

        console.log(`[Worker] Saving: ${candidate.title.substring(0, 50)}...`);
        const { error } = await supabase.from('detection_candidates').insert(candidate);
        if (error) {
            console.error('[Worker] Insert error:', error);
        } else {
            saved++;
            console.log('[Worker] Saved successfully');
        }
    }

    console.log(`[Worker] Results: ${saved} saved, ${duplicates} duplicates, ${allCandidates.length - saved - duplicates} errors`);
    return { saved, total: allCandidates.length };
}

/**
 * Main execution
 */
async function main(): Promise<void> {
    console.log('========================================');
    console.log('[Worker] Detection Worker Starting');
    console.log(`[Worker] Time: ${new Date().toISOString()}`);
    console.log('========================================\n');
    
    const hasLock = await acquireLock();
    if (!hasLock) {
        console.log('[Worker] Another instance running, exiting');
        process.exit(0);
    }
    
    try {
        const result = await runDetection();
        await releaseLock();
        
        console.log('\n========================================');
        console.log('[Worker] Complete');
        console.log(`[Worker] Saved: ${result.saved}, Total: ${result.total}`);
        console.log('========================================');
        
        process.exit(0);
    } catch (error: any) {
        console.error('\n[Worker] ERROR:', error.message);
        await releaseLock();
        process.exit(1);
    }
}

main();
