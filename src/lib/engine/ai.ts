import { EDITORIAL_SYSTEM_PROMPT } from './prompts';
import { buildFallbackCaption } from './caption-fallback';
import { logError } from '../logging/structured-logger';

/**
 * AI Engine for KumoLab.
 *
 * Resilience model:
 *   - Provider chain. Tried in order on every chat call. First success wins;
 *     each failure (network / 4xx / 5xx / parse error) walks to the next
 *     provider before any caller-level fallback runs. So losing one provider
 *     doesn't drop a feature.
 *
 *   - Default chain (free → free → cheap paid):
 *       1. Gemini       (GEMINI_API_KEY)     — Google's OpenAI-compat endpoint
 *       2. Groq         (GROQ_API_KEY)       — fast free tier
 *       3. DeepSeek     (DEEPSEEK_API_KEY)   — paid; cheap last-resort
 *
 *   - Legacy tail (still supported so existing Vercel envs keep working):
 *       4. Kimi         (KIMI_API_KEY / MOONSHOT_API_KEY)
 *       5. OpenAI       (OPENAI_API_KEY)
 *       6. Antigravity  (ANTIGRAVITY_AI_ENDPOINT — old self-hosted Ollama tunnel)
 *
 *   - Per-touchpoint fallbacks if EVERY provider fails:
 *       • generateCaption       → deterministic template (caption-fallback.ts)
 *       • translateToEnglish    → return original (mark untranslated)
 *       • formatKumoLabTitle    → return raw title
 *       • checkToneAndSafety    → heuristic phrase/length scan (no LLM)
 *       • generateFromIntel     → null (caller skips)
 *       • processEditorialPrompt→ throws (admin-triggered, error visible)
 *
 *   That last layer is what lets KumoLab keep publishing English-source
 *   posts with zero AI access. Non-English candidates re-queue rather than
 *   reject so they process when AI returns.
 */

type Provider = {
    name: string;
    baseURL: string;
    apiKey: string;
    model: string;
    // Some providers reject requests that include response_format. We only
    // attach it when this is true.
    supportsResponseFormat: boolean;
};

function buildProviderChain(): Provider[] {
    const chain: Provider[] = [];

    if (process.env.GEMINI_API_KEY) {
        chain.push({
            name: 'gemini',
            baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
            apiKey: process.env.GEMINI_API_KEY,
            model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
            supportsResponseFormat: true,
        });
    }

    if (process.env.GROQ_API_KEY) {
        chain.push({
            name: 'groq',
            baseURL: 'https://api.groq.com/openai/v1',
            apiKey: process.env.GROQ_API_KEY,
            model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
            supportsResponseFormat: true,
        });
    }

    if (process.env.DEEPSEEK_API_KEY) {
        chain.push({
            name: 'deepseek',
            baseURL: 'https://api.deepseek.com/v1',
            apiKey: process.env.DEEPSEEK_API_KEY,
            model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
            supportsResponseFormat: true,
        });
    }

    // Legacy tail — keep prior envs working without forcing a config swap.
    const kimiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
    if (kimiKey) {
        chain.push({
            name: 'kimi',
            baseURL: 'https://api.moonshot.ai/v1',
            apiKey: kimiKey,
            model: process.env.KIMI_MODEL || 'kimi-k2.5',
            supportsResponseFormat: false,
        });
    }

    if (process.env.OPENAI_API_KEY) {
        chain.push({
            name: 'openai',
            baseURL: 'https://api.openai.com/v1',
            apiKey: process.env.OPENAI_API_KEY,
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            supportsResponseFormat: true,
        });
    }

    if (process.env.ANTIGRAVITY_AI_ENDPOINT) {
        chain.push({
            name: 'antigravity',
            baseURL: process.env.ANTIGRAVITY_AI_ENDPOINT,
            apiKey: process.env.ANTIGRAVITY_AI_KEY || 'internal-bearer',
            model: process.env.ANTIGRAVITY_AI_MODEL || 'antigravity-1.0',
            supportsResponseFormat: false,
        });
    }

    return chain;
}

export class AntigravityAI {
    private static instance: AntigravityAI;
    private chain: Provider[];

    private constructor() {
        this.chain = buildProviderChain();
        if (this.chain.length === 0) {
            console.warn('[AI] No providers configured. Set GEMINI_API_KEY, GROQ_API_KEY, or DEEPSEEK_API_KEY in env.');
        } else {
            console.log(`[AI] Provider chain: ${this.chain.map(p => p.name).join(' → ')}`);
        }
    }

    public static getInstance(): AntigravityAI {
        if (!AntigravityAI.instance) {
            AntigravityAI.instance = new AntigravityAI();
        }
        return AntigravityAI.instance;
    }

    public hasAnyProvider(): boolean {
        return this.chain.length > 0;
    }

    /**
     * Walks the provider chain. First successful response wins; failures
     * are collected so the final thrown error names every provider that
     * didn't respond. Caller methods catch this and fall back to their
     * deterministic strategy.
     */
    private async sendCompletionRequest(messages: any[], jsonMode: boolean = true): Promise<any> {
        if (this.chain.length === 0) {
            throw new Error('No AI providers configured (set GEMINI_API_KEY, GROQ_API_KEY, or DEEPSEEK_API_KEY)');
        }
        const failures: string[] = [];
        for (const provider of this.chain) {
            try {
                return await this.callProvider(provider, messages, jsonMode);
            } catch (e: any) {
                const msg = (e?.message || String(e)).slice(0, 220);
                failures.push(`${provider.name} ${msg}`);
            }
        }
        throw new Error(`All AI providers failed → ${failures.join(' | ').slice(0, 800)}`);
    }

    private async callProvider(provider: Provider, messages: any[], jsonMode: boolean): Promise<any> {
        const url = `${provider.baseURL.replace(/\/$/, '')}/chat/completions`;
        const body: any = {
            model: provider.model,
            messages,
            temperature: 1,
        };
        if (jsonMode && provider.supportsResponseFormat) {
            body.response_format = { type: 'json_object' };
        }

        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 25_000);
        let response: Response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${provider.apiKey}`,
                },
                body: JSON.stringify(body),
                signal: ctrl.signal,
            });
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            // Strip HTML error pages (e.g. Cloudflare 1033) and cap length so
            // the failure string stays readable in error_logs.
            const raw = await response.text().catch(() => '');
            const compact = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            const trimmed = compact.length > 160 ? compact.slice(0, 160) + '…' : compact;
            throw new Error(`HTTP ${response.status}${trimmed ? `: ${trimmed}` : ''}`);
        }

        return await response.json();
    }

    /**
     * Editorial Assist: admin panel — drafting / refining posts manually.
     * On full chain failure this throws so the admin sees the error.
     */
    public async processEditorialPrompt(params: {
        prompt: string;
        history?: any[];
        currentDraft?: any;
    }) {
        const { prompt, history = [], currentDraft } = params;

        const messages: any[] = [
            {
                role: 'system',
                content: `
${EDITORIAL_SYSTEM_PROMPT}

You are the AI Editorial Assistant for KumoLab.
Your job is to help the user draft and refine posts.

CORE RULES:
- Tone: Professional, factual, concise, observational.
- Length: Content MUST be under 280 characters.
- Accuracy: Use the provided context accurately.

RESPONSE FORMAT:
You MUST respond with a JSON object. No other text.
{
  "title": "Anime Title + Status (e.g. Solo Leveling Season 2 Confirmed)",
  "content": "Short paragraph (max 280 chars) explaining the news or moment.",
  "type": "INTEL | TRENDING",
  "status": "One of: confirmed, premiered, now_streaming, delayed, trailer, finale_aired, new_visual",
  "imageSearchTerm": "Primary anime name for image search (e.g. Solo Leveling)",
  "reasoning": "Brief explanation of changes made (if refining)"
}

If the user provides a follow-up or refinement, reference the current draft and their feedback to improve it.
Current Date: ${new Date().toISOString().split('T')[0]}
`
            }
        ];

        messages.push(...history);
        if (currentDraft && history.length === 0) {
            messages.push({
                role: 'system',
                content: `Current Draft context:\nTitle: ${currentDraft.title}\nContent: ${currentDraft.content}`
            });
        }
        messages.push({ role: 'user', content: prompt });

        const result = await this.sendCompletionRequest(messages, true);
        const content = result.choices?.[0]?.message?.content;

        if (!content) throw new Error('Empty response from AI');

        try {
            return JSON.parse(content);
        } catch (e) {
            console.error('[AI] JSON parse error on editorial response:', content);
            throw new Error('AI returned malformed JSON');
        }
    }

    /**
     * Translate to English. On full-chain failure returns the original
     * inputs unchanged so the candidate stays processable downstream
     * (rather than rejecting outright).
     */
    public async translateToEnglish(title: string, content: string): Promise<{ title: string; content: string }> {
        const messages = [
            {
                role: 'system',
                content: `You are a professional anime news translator. Translate the following Japanese (or non-English) anime news title and content into natural, fluent English.

RULES:
- Keep anime titles/names in their commonly known English form (e.g. 鬼滅の刃 → Demon Slayer)
- If a title is already well-known in English, use that name
- Keep proper nouns, character names, and studio names accurate
- Translate naturally — not word-for-word
- Preserve factual information exactly (dates, episode numbers, seasons)
- Keep the same tone and meaning
- Do NOT add commentary or extra information

Respond with ONLY a JSON object:
{"title": "translated title", "content": "translated content"}`
            },
            {
                role: 'user',
                content: `Title: ${title}\n\nContent: ${content}`
            }
        ];

        try {
            const result = await this.sendCompletionRequest(messages, true);
            const response = result.choices?.[0]?.message?.content;
            if (!response) throw new Error('empty translation');
            try {
                const parsed = JSON.parse(response);
                return { title: parsed.title || title, content: parsed.content || content };
            } catch {
                console.warn('[AI] Translation JSON parse failed, returning original');
                return { title, content };
            }
        } catch (e: any) {
            await logError({
                source: 'engine.ai.translate',
                errorMessage: `translateToEnglish failed (${(e?.message || e).slice(0, 200)}); returning original text`,
                context: { title: title.substring(0, 120) },
            }).catch(() => {});
            return { title, content };
        }
    }

    /**
     * Title formatter. On full-chain failure returns the raw title.
     */
    public async formatKumoLabTitle(rawTitle: string, rawContent: string): Promise<string> {
        const messages = [
            {
                role: 'system',
                content: `You format anime news titles for KumoLab. Follow this EXACT format every time.

RULES:
1. Always use TWO lines.
2. The first line is the anime title in single quotation marks.
3. The second line contains the news update.
4. Keep it short, clean, and factual.
5. Do NOT add extra sentences, commentary, or emojis.
6. Do NOT write "TV Anime".
7. Avoid unnecessary filler words.
8. Use the separator " • " when including two pieces of info.
9. Capitalize properly like a headline.
10. Never exceed two lines.

FORMAT:
'Anime Title'
Key Update • Secondary Detail

EXAMPLES:

'Witch Hat Atelier'
Official Trailer Released • Premieres April 6, 2026

'Agents of the Four Seasons'
New Anime Announced • Premieres March 28, 2026

'MAO'
New Anime • Premieres April 4

'Hell's Paradise' Season 2
New Illustration Released

OUTPUT RULE:
Return ONLY the formatted title.
Do not explain anything.
Do not include extra text.
Do not wrap in quotes or code blocks.`
            },
            {
                role: 'user',
                content: `Title: ${rawTitle}\n\nContext: ${rawContent}`
            }
        ];

        try {
            const result = await this.sendCompletionRequest(messages, false);
            const response = result.choices?.[0]?.message?.content?.trim();
            return response || rawTitle;
        } catch (e: any) {
            await logError({
                source: 'engine.ai.format-title',
                errorMessage: `formatKumoLabTitle failed (${(e?.message || e).slice(0, 200)}); using raw title`,
                context: { title: rawTitle.substring(0, 120) },
            }).catch(() => {});
            return rawTitle;
        }
    }

    /**
     * Generates a 1–2 sentence KumoLab-voice caption. On full-chain failure
     * uses the deterministic claim-type-aware template.
     */
    public async generateCaption(params: {
        title: string;
        content: string;
        claim_type?: string | null;
        source?: string | null;
    }): Promise<string> {
        const { title, content, claim_type, source } = params;
        const claim = (claim_type || 'OTHER').toUpperCase();

        const claimGuide: Record<string, string> = {
            TRAILER_DROP:         'Trailer hook — say what landed and why fans should watch (atmosphere, key moment, studio).',
            NEW_KEY_VISUAL:       'Visual reveal — describe the mood / aesthetic in one beat. No hedging on the studio name.',
            NEW_SEASON_CONFIRMED: 'Season confirmation — state the season # and source plainly. Add one beat of context (lead-up, gap since last season).',
            DATE_ANNOUNCED:       'Release date — lead with the date. Add platform / streamer if known.',
            DELAY:                'Delay — state the new window plainly, no editorializing.',
            CAST_ADDITION:        'Cast — name the actor + role.',
            STAFF_UPDATE:         'Staff — name the role + person.',
        };
        const guide = claimGuide[claim] || 'Lead with the news in one beat. KumoLab voice.';

        const messages = [
            {
                role: 'system',
                content: `You write captions for KumoLab, an anime news brand.

BRAND IDENTITY:
- Tagline: "the cloud sees everything first"
- KumoLab is the source that surfaces the news first — observant, well-positioned, ahead of the rest.
- Voice: sharp, culturally fluent, observant. Never corporate. Never cringe. Never hype-bait.
- Posts assert claims in KumoLab's own voice — no "per @source" attribution, no hedging, no "fans are loving it" filler.
- Where natural, the voice can hint at the brand position (early access, eye on the scene, watching the drop). Don't shoehorn the literal tagline into every caption — that's just as cringe as not having a voice at all.

Write a 1–2 sentence caption (max 180 chars total) for the post below. ${guide}

Rules:
- No emojis.
- No hashtags.
- No "Crunchyroll reportedly" or "according to" phrasing.
- Don't repeat the title verbatim — the caption is a hook, not a summary.
- If the content is thin, say something true and tight rather than padding.

Respond with ONLY the caption text. No JSON, no quotes, no commentary.`,
            },
            {
                role: 'user',
                content: `Title: ${title}\n\nContext: ${content.substring(0, 1500)}`,
            },
        ];

        try {
            const result = await this.sendCompletionRequest(messages, false);
            const raw = result.choices?.[0]?.message?.content?.trim();
            if (!raw) throw new Error('empty caption');
            const cleaned = raw.replace(/^["']|["']$/g, '').trim();
            return cleaned.length > 200 ? cleaned.substring(0, 197).trim() + '…' : cleaned;
        } catch (e: any) {
            await logError({
                source: 'engine.ai.caption',
                errorMessage: `generateCaption failed (${(e?.message || e).slice(0, 200)}); using deterministic fallback`,
                context: { title: title.substring(0, 120), claim_type: claim },
            }).catch(() => {});
            return buildFallbackCaption({ title, claim_type: claim, source });
        }
    }

    /**
     * Tone + safety gate. On full-chain failure runs a deterministic
     * heuristic instead of failing closed — KumoLab's English-source
     * pipeline keeps publishing without any LLM access.
     */
    public async checkToneAndSafety(title: string, content: string): Promise<{
        on_brand: boolean;
        safe: boolean;
        factually_hedged: boolean;
        confidence: number;
        reason: string;
    }> {
        const messages = [
            {
                role: 'system',
                content: `You are the KumoLab brand guardrail.

KUMOLAB IDENTITY:
- Tagline: "the cloud sees everything first" — KumoLab is the source that surfaces anime news first, an observant brand watching the scene.
- Voice: sharp, culturally fluent, observant. Never corporate, never cringe, never hype-bait, never generic filler.
- Posts assert claims in KumoLab's own voice. No "per @Crunchyroll" attribution. No "fans are loving it" filler. KumoLab verifies and states the fact.

Evaluate the given post title + content on four dimensions:
- on_brand: tone is KumoLab-appropriate. Reject corporate-speak, generic hype, "exciting news for fans!" filler, or anything that sounds like a press release.
- safe: no profanity, slurs, NSFW, conspiracy theories, unverifiable gossip, or attacks on individuals.
- factually_hedged: the copy does NOT overstate unverified claims (e.g. "CONFIRMED" when only one source reported it loosely). This is about accuracy, not attribution.
- confidence: 0-100, your confidence that this post is safe to publish without human review.

RESPOND WITH STRICT JSON:
{"on_brand": true|false, "safe": true|false, "factually_hedged": true|false, "confidence": 0-100, "reason": "one-line explanation"}`
            },
            { role: 'user', content: `Title: ${title}\n\nContent: ${content}` }
        ];

        try {
            const result = await this.sendCompletionRequest(messages, true);
            const raw = result.choices?.[0]?.message?.content;
            if (!raw) throw new Error('empty');
            const parsed = JSON.parse(raw);
            return {
                on_brand: !!parsed.on_brand,
                safe: !!parsed.safe,
                factually_hedged: parsed.factually_hedged !== false,
                confidence: Number(parsed.confidence) || 0,
                reason: String(parsed.reason || ''),
            };
        } catch (e: any) {
            // No AI? Run a deterministic phrase/length scan and return its
            // verdict. Most KumoLab candidates come from official sources
            // already — the heuristic is permissive enough to keep the
            // pipeline moving and only flags candidates that contain known
            // bad phrasing.
            await logError({
                source: 'engine.ai.tone',
                errorMessage: `checkToneAndSafety AI unavailable (${(e?.message || e).slice(0, 160)}); using heuristic fallback`,
                context: { title: title.substring(0, 120) },
            }).catch(() => {});
            return heuristicToneSafety(title, content);
        }
    }

    /**
     * Daily Drops / batch generation. On full-chain failure returns null
     * so the caller can skip this candidate and try again next cycle.
     */
    public async generateFromIntel(sourceData: string, type: 'INTEL' | 'TRENDING') {
        const messages: any[] = [
            {
                role: 'system',
                content: `${EDITORIAL_SYSTEM_PROMPT}\n\nYou are the background automation engine. Generate a post based on the following raw data.`
            },
            { role: 'user', content: sourceData }
        ];

        try {
            const result = await this.sendCompletionRequest(messages, true);
            const content = result.choices?.[0]?.message?.content;
            return content ? JSON.parse(content) : null;
        } catch (e: any) {
            await logError({
                source: 'engine.ai.intel',
                errorMessage: `generateFromIntel failed (${(e?.message || e).slice(0, 200)}); skipping candidate`,
                context: { type, source_preview: sourceData.substring(0, 120) },
            }).catch(() => {});
            return null;
        }
    }
}

// ── Heuristic tone/safety fallback ────────────────────────────────
//
// Runs when the entire AI provider chain is down. Returns a verdict
// permissive enough to keep auto-publish moving for clean source titles
// while still flagging the obvious cringe / hype patterns. This is a
// last-line defence, not a substitute for the LLM check — the verdict
// engine treats !on_brand / !safe / !factually_hedged as
// QUEUE_FOR_REVIEW (not REJECT), so a heuristic miss just routes a post
// to the admin instead of dropping it.

const CRINGE_PHRASES = [
    'exciting news for fans',
    "you won't believe",
    'must-watch',
    'must watch',
    'fans are loving',
    'fans are going',
    'trending now',
    'epic news',
    'mind-blowing',
    'going viral',
    'breaking the internet',
    'amazing news',
    'jaw-dropping',
];

const HEDGE_PHRASES = [
    'reportedly',
    'according to rumors',
    'allegedly',
    'sources say',
    'per a leak',
    'per leaks',
];

const UNSAFE_PATTERNS = [
    /\b(?:nsfw|porn|hentai)\b/i,
    /\b(?:fuck|shit|bitch)\b/i,
];

function heuristicToneSafety(title: string, content: string): {
    on_brand: boolean;
    safe: boolean;
    factually_hedged: boolean;
    confidence: number;
    reason: string;
} {
    const text = `${title}\n${content}`;
    const lower = text.toLowerCase();

    const foundCringe = CRINGE_PHRASES.find(p => lower.includes(p));
    const foundHedge = HEDGE_PHRASES.find(p => lower.includes(p));
    const foundUnsafe = UNSAFE_PATTERNS.find(p => p.test(text));
    const exclamationCount = (text.match(/!/g) || []).length;
    const allCapsWords = (text.match(/\b[A-Z]{4,}\b/g) || []).filter(w => !['NEWS', 'ANIME', 'MANGA', 'OVA', 'OAD'].includes(w));

    const onBrand = !foundCringe && exclamationCount < 3 && allCapsWords.length < 4;
    const safe = !foundUnsafe;
    const factuallyHedged = !foundHedge;

    const reasons: string[] = [];
    if (foundCringe) reasons.push(`cringe phrase "${foundCringe}"`);
    if (foundHedge) reasons.push(`hedge phrase "${foundHedge}"`);
    if (foundUnsafe) reasons.push('unsafe content pattern');
    if (exclamationCount >= 3) reasons.push('excessive !');
    if (allCapsWords.length >= 4) reasons.push('all-caps shouting');

    const allPass = onBrand && safe && factuallyHedged;
    return {
        on_brand: onBrand,
        safe,
        factually_hedged: factuallyHedged,
        // Confidence is bounded under what an LLM would return — keeps
        // the verdict engine biased toward QUEUE_FOR_REVIEW for anything
        // borderline, which is the right behaviour when AI is down.
        confidence: allPass ? 55 : 25,
        reason: reasons.length ? `heuristic flags: ${reasons.join(', ')}` : 'heuristic pass (AI providers unavailable)',
    };
}
