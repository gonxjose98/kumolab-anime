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

// RSS Sources
const RSS_SOURCES = [
    { name: 'ANN', url: 'https://www.animenewsnetwork.com/news/rss.xml', tier: 2 },
    { name: 'ComicBook', url: 'https://comicbook.com/anime/feed/', tier: 2 },
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
 * Parse RSS items
 */
function parseRSS(xml: string, sourceName: string): any[] {
    const items = [];
    const itemRegex = /<item>[\s\S]*?<\/item>/g;
    const matches = xml.match(itemRegex) || [];
    console.log(`[Worker] Found ${matches.length} items in ${sourceName} feed`);
    
    for (const item of matches.slice(0, 10)) {
        const titleMatch = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
        const linkMatch = item.match(/<link>(.*?)<\/link>/);
        const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
        const descMatch = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
        
        const title = titleMatch?.[1] || '';
        const link = linkMatch?.[1] || '';
        const pubDate = pubDateMatch?.[1] || '';
        const desc = descMatch?.[1] || '';
        
        if (!title || !link) continue;
        
        items.push({
            source_name: sourceName,
            source_tier: 2,
            source_url: link,
            title: title.substring(0, 200),
            content: desc.replace(/<[^>]+>/g, ' ').substring(0, 1000),
            detected_at: new Date().toISOString(),
            original_timestamp: pubDate ? new Date(pubDate).toISOString() : null,
            media_urls: [],
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
 * Main detection worker
 */
async function runDetection(): Promise<{saved: number, total: number}> {
    console.log('[Worker] Starting detection...');
    
    const allCandidates = [];
    
    // Fetch RSS feeds
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
