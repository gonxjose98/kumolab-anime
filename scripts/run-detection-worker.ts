/**
 * Standalone Detection Worker Runner
 * Executed via GitHub Actions every 10 minutes
 */

import { createClient } from '@supabase/supabase-js';

// Supabase configuration - MUST be set in environment
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Validate environment before creating client
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ FATAL: Missing required environment variables');
    console.error('   NEXT_PUBLIC_SUPABASE_URL:', SUPABASE_URL ? 'set' : 'MISSING');
    console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_KEY ? 'set' : 'MISSING');
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
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'KumoLab-DetectionWorker/1.0' },
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) return null;
        return await response.text();
    } catch (e) {
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
    
    for (const item of matches.slice(0, 10)) {
        const title = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] || '';
        const link = item.match(/<link>(.*?)<\/link>/)?.[1] || '';
        const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
        const desc = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] || '';
        
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
    const { data } = await supabase
        .from('detection_candidates')
        .select('id')
        .or(`fingerprint.eq.${fingerprint},source_url.eq.${url}`)
        .limit(1);
    return data && data.length > 0;
}

/**
 * Acquire lock
 */
async function acquireLock(): Promise<boolean> {
    try {
        const { data: existing } = await supabase
            .from('worker_locks')
            .select('*')
            .eq('lock_id', LOCK_ID)
            .single();
        
        if (existing) {
            const age = Date.now() - new Date(existing.acquired_at).getTime();
            if (age < LOCK_DURATION_MS) {
                console.log('[Worker] Lock active, skipping...');
                return false;
            }
            await supabase.from('worker_locks').delete().eq('lock_id', LOCK_ID);
        }
        
        await supabase.from('worker_locks').insert({
            lock_id: LOCK_ID,
            acquired_at: new Date().toISOString(),
            process_id: process.env.GITHUB_RUN_ID || 'local',
            hostname: 'github-actions'
        });
        
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
        console.log(`[Worker] Fetching ${source.name}...`);
        const xml = await fetchRSS(source.url);
        if (xml) {
            const items = parseRSS(xml, source.name);
            allCandidates.push(...items);
            console.log(`[Worker] ${source.name}: ${items.length} items`);
        } else {
            console.log(`[Worker] ${source.name}: Failed`);
        }
    }
    
    // Save to database
    let saved = 0;
    for (const candidate of allCandidates) {
        if (await isDuplicate(candidate.fingerprint, candidate.source_url)) {
            continue;
        }
        
        const { error } = await supabase.from('detection_candidates').insert(candidate);
        if (!error) saved++;
    }
    
    console.log(`[Worker] Saved ${saved}/${allCandidates.length} candidates`);
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
