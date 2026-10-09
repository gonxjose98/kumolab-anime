/**
 * Anime Wire: a raw, unfiltered feed of everything the scrapers see.
 *
 * The detection worker calls `parseFeedForWire` for every RSS / YouTube
 * payload it fetches (BEFORE its keyword filters), plus a few wire-only feeds
 * that never enter the post pipeline. Writes are one upsert per batch keyed on
 * a URL fingerprint, and every function here swallows its own errors so a wire
 * failure can never break detection.
 */
import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type WireKind = 'news' | 'streaming' | 'release' | 'youtube' | 'trending';

export interface WireItemInput {
    fingerprint: string;
    kind: WireKind;
    title: string;
    url: string | null;
    source_name: string;
    published_at: string | null;
    anime_title?: string | null;
    image?: string | null;
    summary?: string | null;
    decision?: string | null;
}

/** Wire-only feeds (verified responding 2026-10-09). Never fed to the post pipeline. */
export const WIRE_ONLY_FEEDS = [
    { name: 'Anime Corner', url: 'https://animecorner.me/feed/' },
    { name: 'OtakuNews', url: 'https://www.otakunews.com/rss/rss.xml' },
];

const STREAMING_RE = /\b(netflix|crunchyroll|disney\+|disney plus|hulu|hidive|prime video|amazon prime|now streaming|streaming on|to stream)\b/i;
const RELEASE_RE = /\b(premiere|premieres|release date|airs? (?:on|in|from)|debuts?|season \d+|\d+(?:st|nd|rd|th) season|new season|final season|sequel|announced|greenlit|movie opens?)\b/i;

export function wireFingerprint(key: string): string {
    return createHash('sha1').update(key.trim().toLowerCase()).digest('hex').slice(0, 32);
}

export function classifyWireKind(title: string, summary: string, isYouTube: boolean): WireKind {
    if (isYouTube) return 'youtube';
    const text = `${title} ${summary}`;
    if (STREAMING_RE.test(text)) return 'streaming';
    if (RELEASE_RE.test(title)) return 'release';
    return 'news';
}

function decode(text: string): string {
    let s = text;
    for (let i = 0; i < 2; i++) {
        s = s
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;|&#x27;|&#8217;|&#8216;/g, "'")
            .replace(/&#8220;|&#8221;/g, '"').replace(/&nbsp;/g, ' ')
            .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
    }
    return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const firstMatch = (src: string, res: RegExp[]) => {
    for (const re of res) {
        const m = src.match(re);
        if (m?.[1]) return m[1];
    }
    return '';
};

/** Parse every item of an RSS / Atom / YouTube feed into wire rows. */
export function parseFeedForWire(xml: string, sourceName: string, opts: { youtube?: boolean } = {}): WireItemInput[] {
    const out: WireItemInput[] = [];
    try {
        const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/g) || [];
        for (const b of blocks.slice(0, 30)) {
            const title = decode(firstMatch(b, [/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/]));
            let url = firstMatch(b, [/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/, /<link[^>]*href="([^"]+)"/, /<link>(?:<!\[CDATA\[)?\s*([\s\S]*?)\s*(?:\]\]>)?<\/link>/]).trim();
            const videoId = firstMatch(b, [/<yt:videoId>([\s\S]*?)<\/yt:videoId>/]).trim();
            if (opts.youtube && videoId) url = `https://youtube.com/watch?v=${videoId}`;
            if (!title || !url) continue;

            const pub = firstMatch(b, [/<pubDate>([\s\S]*?)<\/pubDate>/, /<published>([\s\S]*?)<\/published>/, /<updated>([\s\S]*?)<\/updated>/, /<dc:date>([\s\S]*?)<\/dc:date>/]).trim();
            const pubDate = pub ? new Date(pub) : null;
            const rawDesc = firstMatch(b, [
                /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/,
                /<media:description[^>]*>([\s\S]*?)<\/media:description>/,
                /<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/,
            ]);
            const summary = decode(rawDesc);
            const image = videoId
                ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
                : firstMatch(b, [/<media:content[^>]+url="([^"]+)"/, /<media:thumbnail[^>]+url="([^"]+)"/, /<enclosure[^>]+url="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i, /<img[^>]+src="([^"]+)"/]) || null;

            out.push({
                fingerprint: wireFingerprint(url),
                kind: classifyWireKind(title, summary, !!opts.youtube),
                title: title.slice(0, 300),
                url,
                source_name: sourceName,
                published_at: pubDate && !isNaN(pubDate.getTime()) ? pubDate.toISOString() : null,
                image,
                summary: summary ? (summary.length > 400 ? `${summary.slice(0, 397)}...` : summary) : null,
            });
        }
    } catch (e) {
        console.error(`[Wire] parse failed for ${sourceName}:`, (e as Error).message);
    }
    return out;
}

// ─── Anime title matching (best effort) ──────────────────────
let titleCache: { at: number; titles: string[] } | null = null;

async function knownTitles(): Promise<string[]> {
    if (titleCache && Date.now() - titleCache.at < 10 * 60_000) return titleCache.titles;
    const [radar, tiers] = await Promise.all([
        supabaseAdmin.from('release_radar').select('title_english, title_romaji').limit(1000),
        supabaseAdmin.from('anime_tiers').select('anime').eq('active', true).limit(1000),
    ]);
    const set = new Set<string>();
    for (const r of radar.data || []) {
        if (r.title_english) set.add(r.title_english);
        if (r.title_romaji) set.add(r.title_romaji);
    }
    for (const t of tiers.data || []) if (t.anime) set.add(t.anime);
    // Longest first so "Jujutsu Kaisen Season 3" beats "Jujutsu Kaisen".
    const titles = [...set].filter((t) => t.length >= 4).sort((a, b) => b.length - a.length);
    titleCache = { at: Date.now(), titles };
    return titles;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function matchTitle(text: string, titles: string[]): string | null {
    const hay = ` ${norm(text)} `;
    for (const t of titles) {
        const n = norm(t);
        if (n.length >= 4 && hay.includes(` ${n} `)) return t;
    }
    return null;
}

/** Upsert wire rows. Never throws. Returns rows written. */
export async function upsertWireItems(items: WireItemInput[]): Promise<number> {
    if (!items.length) return 0;
    try {
        const titles = await knownTitles().catch(() => [] as string[]);
        const seen = new Set<string>();
        const rows = items
            .filter((i) => (seen.has(i.fingerprint) ? false : (seen.add(i.fingerprint), true)))
            .map((i) => ({
                ...i,
                anime_title: i.anime_title ?? matchTitle(i.title, titles) ?? matchTitle(i.summary || '', titles),
            }));
        // Don't overwrite a decision already recorded with null.
        const withDecision = rows.filter((r) => r.decision);
        const without = rows.filter((r) => !r.decision).map(({ decision: _d, ...rest }) => rest);
        let written = 0;
        for (const batch of [withDecision, without]) {
            if (!batch.length) continue;
            const { error } = await supabaseAdmin.from('wire_items').upsert(batch, { onConflict: 'fingerprint' });
            if (error) console.error('[Wire] upsert failed:', error.message);
            else written += batch.length;
        }
        return written;
    } catch (e) {
        console.error('[Wire] upsert threw:', (e as Error).message);
        return 0;
    }
}

/** Fetch + store the wire-only feeds. Never throws. */
export async function scanWireOnlyFeeds(): Promise<number> {
    let total = 0;
    await Promise.all(WIRE_ONLY_FEEDS.map(async (f) => {
        try {
            const res = await fetch(f.url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KumoLab-Wire/1.0)', Accept: 'application/rss+xml, application/xml, text/xml' },
                signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) return;
            total += await upsertWireItems(parseFeedForWire(await res.text(), f.name));
        } catch (e) {
            console.error(`[Wire] ${f.name} failed:`, (e as Error).message);
        }
    }));
    return total;
}

/** Retention: drop rows detected more than 60 days ago. */
export async function pruneWire(days = 60): Promise<number> {
    const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
    const { count, error } = await supabaseAdmin.from('wire_items').delete({ count: 'exact' }).lt('detected_at', cutoff);
    if (error) console.error('[Wire] prune failed:', error.message);
    return count ?? 0;
}
