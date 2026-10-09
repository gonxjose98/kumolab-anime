/**
 * Anime Wire enrichment: plain-English headlines + pictures for the dashboard.
 *
 * Runs after the detection worker flushes the wire (and on `?worker=wire-enrich`).
 *   1. Text: rows missing plain_title go to Haiku ~20 at a time (JSON in, JSON
 *      out) for plain_title, is_anime, anime_title and importance 1-5. The
 *      model only sees facts we hand it, and is told never to add claims.
 *   2. Images: rows with no image get one GET of the article page (short
 *      timeout, size cap) and its og:image / twitter:image, checked with a HEAD
 *      so nothing huge gets hotlinked.
 *
 * Never throws. Kill switch: WIRE_ENRICH_ENABLED=false. The UI falls back to the
 * original title and to radar art / an initials tile when anything is missing.
 */
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase/admin';

export const ENRICH_MODEL = 'claude-haiku-4-5-20251001';
const BATCH = 20;
const MAX_ATTEMPTS = 3;
const PAGE_TIMEOUT_MS = 5000;
const PAGE_MAX_BYTES = 400_000;      // og tags live in <head>; never read a whole page
const IMAGE_MAX_BYTES = 1_200_000;   // larger pictures are skipped, never hotlinked
const UA = 'Mozilla/5.0 (compatible; KumoLab-Wire/1.0; +https://kumolabanime.com)';

export const enrichEnabled = () => process.env.WIRE_ENRICH_ENABLED !== 'false';

// ─── Pure helpers (unit tested) ──────────────────────────────

const decodeAttr = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

/** og:image / twitter:image candidates from page HTML, best first, absolute URLs. */
export function parseOgImages(html: string, pageUrl: string): string[] {
    const want = ['og:image', 'og:image:secure_url', 'og:image:url', 'twitter:image', 'twitter:image:src'];
    const found: { rank: number; url: string }[] = [];
    for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
        const key = (tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1] || '').toLowerCase();
        const rank = want.indexOf(key);
        if (rank < 0) continue;
        const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
        if (!content) continue;
        try {
            const abs = new URL(decodeAttr(content), pageUrl).toString();
            if (/^https:\/\//i.test(abs) || /^http:\/\//i.test(abs)) found.push({ rank, url: abs });
        } catch { /* bad URL */ }
    }
    found.sort((a, b) => a.rank - b.rank);
    return [...new Set(found.map((f) => f.url))];
}

export const normTitle = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export interface RadarLite {
    anilist_id: number;
    title_english: string | null;
    title_romaji: string | null;
    popularity: number | null;
    streaming: { name: string }[] | null;
    anticipation_rank: number | null;
    next_episode: number | null;
    next_airing_at: string | null;
    start_date: string | null;
    season_label: string | null;
    status: string | null;
}

/** Radar show a title refers to: exact normalized match, else the longest radar title it contains. */
export function matchRadar(title: string | null | undefined, radar: RadarLite[]): RadarLite | null {
    if (!title) return null;
    const t = normTitle(title);
    if (t.length < 3) return null;
    let best: { r: RadarLite; len: number } | null = null;
    for (const r of radar) {
        for (const cand of [r.title_english, r.title_romaji]) {
            if (!cand) continue;
            const c = normTitle(cand);
            if (c.length < 4) continue;
            if (c === t) return r;
            const contains = ` ${t} `.includes(` ${c} `) || (t.length >= 8 && ` ${c} `.includes(` ${t} `));
            if (contains && (!best || c.length > best.len)) best = { r, len: c.length };
        }
    }
    return best?.r ?? null;
}

export interface EnrichInput {
    id: number;
    title: string;
    summary: string | null;
    source: string | null;
    kind: string;
    facts: string[];
}

export interface EnrichOutput {
    id: number;
    plain_title: string;
    is_anime: boolean;
    anime_title: string | null;
    importance: number;
}

export const ENRICH_SYSTEM = `You rewrite anime news headlines for a busy business owner who does not follow anime closely.

For every item return:
- plain_title: plain English, at most 90 characters, saying what happened and why it matters. Say what kind of thing it is ("New show", "Season 3 of", "Movie", "Manga") when the item says so. Drop Japanese romanizations when an English name or a plain description works. Translate jargon: "PV" = trailer, "OP" = opening song, "ED" = ending song, "cour" = part, "key visual" = poster.
- is_anime: true when the item is about anime, manga, light novels, Japanese animation studios, voice actors or anime music. false for video games, arcade machines, live-action films and TV, Western comics, celebrities and general entertainment news.
- anime_title: the main anime or manga the item is about, in its most common English or romaji form, without "Season N" or episode text. null when there is none.
- importance: 1 to 5, using ONLY facts present in the item and its listed facts. Raise it for: a big show (listed AniList members, a top anticipated rank), a streaming platform involved, a new season or sequel, a premiere or release date, several outlets covering the same story. Routine merch, events, licensing lists and minor cast additions stay at 1 or 2. 5 is rare.

Hard rules: never add facts, dates, platforms or claims that are not in the item. Never use em dashes. Keep proper names spelled as given. Return every id exactly once.`;

export function enrichUserTurn(items: EnrichInput[]): string {
    return JSON.stringify({
        items: items.map((i) => ({
            id: i.id,
            headline: i.title,
            summary: i.summary ? i.summary.slice(0, 320) : undefined,
            source: i.source || undefined,
            facts: i.facts.length ? i.facts : undefined,
        })),
    });
}

export const ENRICH_SCHEMA = {
    type: 'object',
    properties: {
        items: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'integer' },
                    plain_title: { type: 'string' },
                    is_anime: { type: 'boolean' },
                    anime_title: { type: ['string', 'null'] },
                    importance: { type: 'integer' },
                },
                required: ['id', 'plain_title', 'is_anime', 'anime_title', 'importance'],
                additionalProperties: false,
            },
        },
    },
    required: ['items'],
    additionalProperties: false,
} as const;

const EM_DASH = String.fromCharCode(8212);
const EN_DASH = String.fromCharCode(8211);

/** Validate + clean model rows against the ids we asked about. */
export function cleanModelItems(raw: unknown, askedIds: Set<number>): EnrichOutput[] {
    const list = (raw as { items?: unknown[] })?.items;
    if (!Array.isArray(list)) return [];
    const out: EnrichOutput[] = [];
    const seen = new Set<number>();
    for (const r of list as Record<string, unknown>[]) {
        const id = Number(r?.id);
        if (!askedIds.has(id) || seen.has(id)) continue;
        let title = typeof r.plain_title === 'string' ? r.plain_title : '';
        title = title.split(EM_DASH).join(', ').split(EN_DASH).join('-').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
        if (!title) continue;
        if (title.length > 110) title = `${title.slice(0, 107).replace(/\s+\S*$/, '')}...`;
        const imp = Math.round(Number(r.importance));
        const anime = typeof r.anime_title === 'string' && r.anime_title.trim() ? r.anime_title.trim().slice(0, 160) : null;
        seen.add(id);
        out.push({
            id,
            plain_title: title,
            is_anime: r.is_anime !== false,
            anime_title: anime,
            importance: Number.isFinite(imp) ? Math.min(5, Math.max(1, imp)) : 2,
        });
    }
    return out;
}

const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));

/** Plain facts about the matched radar show, for the importance call. */
export function radarFacts(r: RadarLite | null, nowMs = Date.now()): string[] {
    if (!r) return [];
    const f: string[] = [];
    if (r.popularity) f.push(`${compact(r.popularity)} AniList members`);
    if (r.anticipation_rank && r.anticipation_rank <= 25) f.push(`#${r.anticipation_rank} most anticipated upcoming show on AniList`);
    if (r.season_label) f.push(r.season_label);
    const streams = (r.streaming || []).map((s) => s.name).slice(0, 3);
    if (streams.length) f.push(`Streams on ${streams.join(', ')}`);
    if (r.next_airing_at && r.next_episode === 1 && Date.parse(r.next_airing_at) > nowMs) f.push('Premieres within 60 days');
    return f;
}

// ─── Network steps ───────────────────────────────────────────

async function readCapped(res: Response, maxBytes: number): Promise<string> {
    if (!res.body) return (await res.text()).slice(0, maxBytes);
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < maxBytes) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        total += value.byteLength;
        // og tags are in <head>; stop as soon as it closes.
        if (new TextDecoder().decode(value).includes('</head>')) break;
    }
    reader.cancel().catch(() => {});
    return new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
}

/** True when the image answers, is an image, and is small enough to hotlink. */
async function imageOk(url: string): Promise<boolean> {
    try {
        const res = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(4000) });
        if (!res.ok) return false;
        const type = res.headers.get('content-type') || '';
        if (type && !type.startsWith('image/')) return false;
        const len = Number(res.headers.get('content-length') || 0);
        return !len || len <= IMAGE_MAX_BYTES;
    } catch {
        return false;
    }
}

export async function fetchOgImage(pageUrl: string): Promise<string | null> {
    try {
        const res = await fetch(pageUrl, {
            headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
            redirect: 'follow',
            signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
        });
        if (!res.ok || !(res.headers.get('content-type') || '').includes('html')) return null;
        const html = await readCapped(res, PAGE_MAX_BYTES);
        for (const cand of parseOgImages(html, res.url || pageUrl).slice(0, 3)) {
            if (await imageOk(cand)) return cand;
        }
    } catch { /* timeout / blocked */ }
    return null;
}

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>, deadline: number) {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
        while (i < items.length && Date.now() < deadline) await fn(items[i++]);
    }));
}

export interface EnrichResult {
    ok: boolean;
    skipped?: string;
    titled: number;
    failedBatches: number;
    imagesFound: number;
    imagesChecked: number;
    inputTokens: number;
    outputTokens: number;
    error?: string;
}

/** Enrich up to `cap` rows. Never throws. */
export async function runWireEnrich(opts: { cap?: number; budgetMs?: number } = {}): Promise<EnrichResult> {
    const cap = Math.min(opts.cap ?? 60, 200);
    const deadline = Date.now() + (opts.budgetMs ?? 75_000);
    const result: EnrichResult = { ok: true, titled: 0, failedBatches: 0, imagesFound: 0, imagesChecked: 0, inputTokens: 0, outputTokens: 0 };
    if (!enrichEnabled()) return { ...result, skipped: 'WIRE_ENRICH_ENABLED=false' };

    try {
        const [textQ, imgQ, radarQ] = await Promise.all([
            supabaseAdmin.from('wire_items')
                .select('id, title, summary, source_name, kind, anime_title, published_at, detected_at')
                .is('plain_title', null).neq('kind', 'trending').lt('enrich_attempts', MAX_ATTEMPTS)
                .order('id', { ascending: false }).limit(cap),
            supabaseAdmin.from('wire_items')
                .select('id, url')
                .is('image', null).is('image_checked_at', null).neq('kind', 'trending').not('url', 'is', null)
                .order('id', { ascending: false }).limit(cap),
            supabaseAdmin.from('release_radar')
                .select('anilist_id, title_english, title_romaji, popularity, streaming, anticipation_rank, next_episode, next_airing_at, start_date, season_label, status')
                .limit(1000),
        ]);
        const radar = (radarQ.data || []) as RadarLite[];

        // ── Images (runs alongside the text calls) ──
        const imageJob = (async () => {
            const rows = (imgQ.data || []) as { id: number; url: string }[];
            await pool(rows, 8, async (r) => {
                const img = await fetchOgImage(r.url);
                result.imagesChecked++;
                if (img) result.imagesFound++;
                await supabaseAdmin.from('wire_items')
                    .update({ image_checked_at: new Date().toISOString(), ...(img ? { image: img } : {}) })
                    .eq('id', r.id);
            }, deadline);
        })();

        // ── Text ──
        const textJob = (async () => {
            const rows = (textQ.data || []) as { id: number; title: string; summary: string | null; source_name: string | null; kind: string; anime_title: string | null; published_at: string | null; detected_at: string }[];
            if (!rows.length) return;
            if (!process.env.ANTHROPIC_API_KEY) { result.skipped = 'ANTHROPIC_API_KEY not set'; return; }

            // Outlet count per show over the last 48h, so "covered by several outlets" is a fact, not a guess.
            const since = new Date(Date.now() - 48 * 3600_000).toISOString();
            const { data: recent } = await supabaseAdmin.from('wire_items')
                .select('anime_title, source_name').gte('detected_at', since).not('anime_title', 'is', null).neq('kind', 'trending').limit(2000);
            const outlets = new Map<string, Set<string>>();
            for (const r of recent || []) {
                const k = normTitle(r.anime_title as string);
                if (!outlets.has(k)) outlets.set(k, new Set());
                outlets.get(k)!.add(String(r.source_name || ''));
            }

            const inputs: EnrichInput[] = rows.map((r) => {
                const m = matchRadar(r.anime_title, radar) || matchRadar(r.title, radar);
                const facts = radarFacts(m);
                const n = r.anime_title ? outlets.get(normTitle(r.anime_title))?.size ?? 0 : 0;
                if (n >= 2) facts.push(`${n} outlets covered this show in the last 48 hours`);
                return { id: r.id, title: r.title, summary: r.summary, source: r.source_name, kind: r.kind, facts };
            });
            const byId = new Map(rows.map((r) => [r.id, r]));

            const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 45_000, maxRetries: 1 });
            const batches: EnrichInput[][] = [];
            for (let i = 0; i < inputs.length; i += BATCH) batches.push(inputs.slice(i, i + BATCH));

            await Promise.all(batches.map(async (batch) => {
                const asked = new Set(batch.map((b) => b.id));
                let cleaned: EnrichOutput[] = [];
                try {
                    if (Date.now() > deadline) throw new Error('time budget');
                    const res = await client.messages.create({
                        model: ENRICH_MODEL,
                        max_tokens: 4000,
                        system: ENRICH_SYSTEM,
                        messages: [{ role: 'user', content: enrichUserTurn(batch) }],
                        output_config: { format: { type: 'json_schema', schema: ENRICH_SCHEMA as unknown as Record<string, unknown> } },
                    });
                    result.inputTokens += res.usage.input_tokens;
                    result.outputTokens += res.usage.output_tokens;
                    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
                    if (res.stop_reason === 'end_turn' && text) cleaned = cleanModelItems(JSON.parse(text), asked);
                } catch (e) {
                    const msg = e instanceof Anthropic.APIError ? `API ${e.status ?? ''}` : (e as Error)?.message;
                    console.error('[WireEnrich] batch failed:', msg);
                }
                if (!cleaned.length) result.failedBatches++;

                const now = new Date().toISOString();
                const done = new Set<number>();
                await Promise.all(cleaned.map(async (c) => {
                    const row = byId.get(c.id)!;
                    const m = matchRadar(c.anime_title, radar) || matchRadar(row.anime_title, radar) || matchRadar(row.title, radar);
                    const animeTitle = m ? (m.title_english || m.title_romaji) : (row.anime_title || c.anime_title);
                    const { error } = await supabaseAdmin.from('wire_items').update({
                        plain_title: c.plain_title,
                        is_anime: c.is_anime,
                        importance: c.importance,
                        anime_title: animeTitle,
                        radar_id: m?.anilist_id ?? null,
                        enriched_at: now,
                        enrich_attempts: 1,
                    }).eq('id', c.id);
                    if (!error) { done.add(c.id); result.titled++; }
                }));
                // Anything the model skipped or that failed: count the attempt so it can't block the queue.
                const missed = batch.filter((b) => !done.has(b.id)).map((b) => b.id);
                for (const id of missed) {
                    const { data } = await supabaseAdmin.from('wire_items').select('enrich_attempts').eq('id', id).maybeSingle();
                    await supabaseAdmin.from('wire_items').update({ enrich_attempts: ((data?.enrich_attempts as number) || 0) + 1 }).eq('id', id);
                }
            }));
        })();

        await Promise.all([imageJob, textJob]);
        return result;
    } catch (e) {
        console.error('[WireEnrich] threw:', (e as Error).message);
        return { ...result, ok: false, error: (e as Error).message };
    }
}
