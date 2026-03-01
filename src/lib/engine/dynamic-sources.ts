/**
 * dynamic-sources.ts
 * Loads scraper sources from Supabase Storage (user-editable via admin UI).
 * Falls back to hardcoded defaults if the config doesn't exist yet.
 */

import { supabaseAdmin } from '../supabase/admin';

const STORAGE_KEY = 'scraper-config.json';
const BUCKET = 'blog-images';

interface XSource {
    handle: string;
    name: string;
    tier: number;
    id?: string;
}

interface YouTubeSource {
    name: string;
    tier: number;
    channelId?: string;
}

interface RSSSource {
    name: string;
    url: string;
    tier?: number;
    lang?: string;
}

interface RedditSource {
    name: string;
    url: string;
    type: string;
}

interface ScraperConfig {
    x: XSource[];
    youtube: YouTubeSource[];
    reddit: RedditSource[];
    rss: RSSSource[];
}

let cachedConfig: ScraperConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minute cache

/**
 * Load scraper sources config from Supabase Storage.
 * Returns null if no config file exists (callers should use their hardcoded defaults).
 */
export async function loadDynamicSources(): Promise<ScraperConfig | null> {
    // Check cache
    if (cachedConfig && Date.now() - cacheTimestamp < CACHE_TTL) {
        return cachedConfig;
    }

    try {
        const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(STORAGE_KEY);
        if (data && !error) {
            const text = await data.text();
            const parsed = JSON.parse(text) as ScraperConfig;
            cachedConfig = parsed;
            cacheTimestamp = Date.now();
            console.log('[DynamicSources] Loaded config from storage');
            return parsed;
        }
    } catch {
        // Config doesn't exist yet — use hardcoded defaults
    }

    return null;
}

/**
 * Get X/Twitter monitored accounts.
 * If dynamic config exists, uses that. Otherwise returns null (use hardcoded).
 */
export async function getXSources(): Promise<XSource[] | null> {
    const config = await loadDynamicSources();
    return config?.x || null;
}

/**
 * Get RSS feed sources.
 * If dynamic config exists, uses that. Otherwise returns null (use hardcoded).
 */
export async function getRSSSources(): Promise<RSSSource[] | null> {
    const config = await loadDynamicSources();
    return config?.rss || null;
}

/**
 * Get YouTube channel sources.
 * If dynamic config exists, uses that. Otherwise returns null (use hardcoded).
 */
export async function getYouTubeSources(): Promise<YouTubeSource[] | null> {
    const config = await loadDynamicSources();
    return config?.youtube || null;
}

export type { XSource, YouTubeSource, RSSSource, RedditSource, ScraperConfig };
