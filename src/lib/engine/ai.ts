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
 *   - Default chain (free → free → free → free → free → cheap paid):
 *       1. Gemini       (GEMINI_API_KEY)
 *       2. Gemini #2    (GEMINI_API_KEY_2) — optional, separate Google account
 *       3. Gemini #3    (GEMINI_API_KEY_3) — optional, separate Google account
 *       4. Groq         (GROQ_API_KEY)
 *       5. DeepSeek     (DEEPSEEK_API_KEY) — paid last-resort
 *
 *     Each Gemini key is tied to a separate GCP project, so its free-tier
 *     quota is independent. Stacking three keys triples the daily free
 *     volume at zero cost.
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

    // Multi-key Gemini: each key is tied to a separate Google Cloud
    // project with its own free-tier quota. Stacking three keys triples
    // the daily free volume at zero cost. When key 1 returns 429
    // (RESOURCE_EXHAUSTED), the chain just walks to key 2 — same model,
    // different account, fresh quota. GEMINI_MODEL applies to all three
    // unless GEMINI_MODEL_2 / GEMINI_MODEL_3 override individually.
    const geminiBase = 'https://generativelanguage.googleapis.com/v1beta/openai';
    const defaultGeminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    if (process.env.GEMINI_API_KEY) {
        chain.push({
            name: 'gemini',
            baseURL: geminiBase,
            apiKey: process.env.GEMINI_API_KEY,
            model: defaultGeminiModel,
            supportsResponseFormat: true,
        });
    }
    if (process.env.GEMINI_API_KEY_2) {
        chain.push({
            name: 'gemini-2',
            baseURL: geminiBase,
            apiKey: process.env.GEMINI_API_KEY_2,
            model: process.env.GEMINI_MODEL_2 || defaultGeminiModel,
            supportsResponseFormat: true,
        });
    }
    if (process.env.GEMINI_API_KEY_3) {
        chain.push({
            name: 'gemini-3',
            baseURL: geminiBase,
            apiKey: process.env.GEMINI_API_KEY_3,
            model: process.env.GEMINI_MODEL_3 || defaultGeminiModel,
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
                content: `You format anime news titles for KumoLab. Output a SINGLE LINE every time.

RULES:
1. Single paragraph only — NO line breaks, NO carriage returns.
2. Wrap the anime title in single quotes: 'Anime Name'.
3. Editorial tone — clean, concise, factual. Mobile-first readability.
4. No clickbait, no hype, no exaggerated language.
5. Never use "officially" or "TV anime". Never write the phrase "new official trailer" verbatim. ("Official Trailer Released" and "New Anime Official Trailer Released" are both fine — see examples.)
6. Use " • " (space-bullet-space) to separate secondary info when needed. At most ONE " • " per title — piling three or four bullets reads as spam.
7. Headline-style capitalization.
8. No emojis, no hashtags, no commentary, no surrounding quotes around the whole output.
9. Keep titles visually balanced and easy to scan on mobile.

STYLE EXAMPLES (match this voice exactly):

'Witch Hat Atelier' New Anime Official Trailer Released • Premieres April 6, 2026

'HELL'S PARADISE' Season 2 New Anime Illustration Released

'Always a Catch' New Anime Official Trailer Released • Premieres April 1

'BEASTARS' Final Season Part 2 Premieres March 7 on Netflix

'MAO' New Anime Premieres April 4 • First PV Released

OUTPUT:
Return ONLY the formatted single-line title. No explanation. No code blocks. No surrounding quotes.`
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

        const messages = [
            {
                role: 'system',
                content: `You write captions for KumoLab, an anime news brand. Match KumoLab's editorial voice exactly.

VOICE:
- Modern anime editorial / news page tone — sharp, observant, culturally fluent.
- KumoLab is the source that surfaces the news first — well-positioned, ahead of the rest.
- Never corporate. Never cringe. Never hype-bait.

CAPTION RULES:
1. Maximum 2 short paragraphs separated by a blank line.
2. Maximum 4 total sentences across the whole caption.
3. First sentence immediately creates interest — atmosphere, stakes, emotion, momentum, or context.
4. Explain WHY the update matters.
5. Never repeat the title word-for-word — the caption is a hook, not a summary.
6. No clickbait, no fake hype, no robotic / corporate phrasing.
7. No filler: never write "officially," "fans are excited," "check it out," "per @source," "according to," or hedging like "reportedly."
8. No hashtags. No emojis.
9. Mobile-friendly — concise, scannable.

STRUCTURE PATTERN (match this shape):
[1–2 sentence hook describing what's interesting and why it matters]

['Anime Title' + concrete detail — when, where, what platform.]

EXAMPLES:

Hideaki Sorachi returns with a brand new supernatural series centered around two angels guiding lost souls to the afterlife.

'DANDELION' premieres on Netflix in April 2026.

---

The final battle between Legoshi and Melon is almost here.

'BEASTARS' Final Season Part 2 begins streaming March 7 on Netflix.

---

A new fantasy series blending magic, mystery, and stunning visuals arrives this spring.

'Witch Hat Atelier' premieres April 6, 2026.

---

Rimuru returns for a brand new movie adventure headed to theaters this May.

'Tears of the Azure Sea' arrives in North America on May 1.

OUTPUT:
Return ONLY the caption text. No JSON, no code blocks, no surrounding quotes, no commentary.
Never exceed 4 sentences.`,
            },
            {
                role: 'user',
                content: `Claim type: ${claim}\nTitle: ${title}\n\nContext: ${content.substring(0, 1500)}`,
            },
        ];

        try {
            const result = await this.sendCompletionRequest(messages, false);
            const raw = result.choices?.[0]?.message?.content?.trim();
            if (!raw) throw new Error('empty caption');
            const cleaned = raw.replace(/^["']|["']$/g, '').trim();
            return cleaned.length > 500 ? cleaned.substring(0, 497).trim() + '…' : cleaned;
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
     * Title for an operator-imported HIGHLIGHT clip (a standout fight scene /
     * sakuga / aesthetic moment from X or IG) — NOT news. Attention-grabbing
     * scene hype, but it must never fabricate a release/trailer/announcement.
     * Returns '' on failure so the caller can fall back.
     */
    public async formatHighlightTitle(rawContext: string): Promise<string> {
        const messages = [
            {
                role: 'system',
                content: `You write punchy, scroll-stopping titles for KumoLab, an anime brand, for short video clips reposted as HIGHLIGHTS — standout fight scenes, sakuga, and aesthetic moments. These are NOT news.

You are given two sections:
- "OPERATOR NOTES" — the ONLY trusted source for naming the anime / character.
- "SOURCE POST TEXT" — a social caption. Useful ONLY for the scene's vibe/energy. It is UNRELIABLE for identification.

ABSOLUTE RULES — breaking these destroys the brand's credibility:
1. NEVER state, guess, or imply the name of any anime, character, studio, voice actor, or person UNLESS that exact name appears in OPERATOR NOTES. Do NOT infer the anime from the SOURCE POST TEXT, from the visuals, or from your own knowledge. A wrong name is far worse than no name.
2. If OPERATOR NOTES does not give an anime name, write the title about the SCENE / ANIMATION ITSELF with NO proper nouns at all — no quoted titles, no character names.
3. NEVER fabricate news: no release, trailer, PV, announcement, premiere, illustration, key visual, date, or platform — unless OPERATOR NOTES explicitly states it.

WHAT TO WRITE:
- ONE punchy, TRUE title that hypes the animation / the fight / the moment so someone stops scrolling and watches.
- Hype is good, but it must be true about the visuals ("the animation here is unreal"), never a fake fact.
- If OPERATOR NOTES names the anime, wrap it in single quotes 'Anime Name' and feature it (plus the character if given).
- Voice: sharp, culturally fluent, modern anime-fan editorial. Confident, not corporate, not cringe.

FORMAT: single line, headline-style capitalization, no line breaks, no emojis, no hashtags, no surrounding quotes, at most one " • ".

EXAMPLE — OPERATOR NOTES say "Demon Slayer, Muichiro fight":
'Demon Slayer' Muichiro's Cut Is Pure Sakuga

EXAMPLE — no anime in OPERATOR NOTES (NEVER invent one):
This Is Some of the Cleanest Sakuga You'll See Today
The Animation in This Fight Goes Absolutely Insane

Return ONLY the title.`,
            },
            { role: 'user', content: rawContext.slice(0, 1800) },
        ];
        try {
            const result = await this.sendCompletionRequest(messages, false);
            const response = result.choices?.[0]?.message?.content?.trim();
            // Strip ONLY a pair of double-quotes wrapping the whole title —
            // never the single-quotes around the anime name ('Fire Force').
            return (response || '').replace(/[\r\n]+/g, ' ').trim().replace(/^"(.+)"$/, '$1').trim();
        } catch (e: any) {
            await logError({
                source: 'engine.ai.highlight-title',
                errorMessage: `formatHighlightTitle failed (${(e?.message || e).slice(0, 200)})`,
                context: { context: rawContext.slice(0, 120) },
            }).catch(() => {});
            return '';
        }
    }

    /**
     * Caption for an operator-imported HIGHLIGHT clip. Hypes the moment, never
     * fabricates news. Returns '' on failure (operator fills it in).
     */
    public async generateHighlightCaption(rawContext: string): Promise<string> {
        const messages = [
            {
                role: 'system',
                content: `You write short captions for KumoLab anime HIGHLIGHT clips — standout fight scenes, sakuga, and aesthetic moments reposted from X/IG. These are NOT news.

You are given "OPERATOR NOTES" (the only trusted source for naming the anime/character) and "SOURCE POST TEXT" (vibe only, UNRELIABLE for identification).

ABSOLUTE RULES:
- NEVER name or imply any anime, character, studio, or person unless that exact name appears in OPERATOR NOTES. Do NOT infer it from the source text or your own knowledge. A wrong name destroys credibility — when unsure, name nothing.
- NEVER invent a release, trailer, announcement, premiere, date, or platform. Caption the MOMENT, not an event.
- 1–3 short sentences. Hook first. Say what makes the scene/animation hit — movement, choreography, weight, tension, color.
- Hype is welcome but must be true ("the fluidity here is absurd"), never clickbait or a fake claim.
- Voice: sharp, culturally fluent anime-fan editorial. No corporate, no cringe, no hashtags, no emojis, no "check it out", no "fans are loving it".

Return ONLY the caption.`,
            },
            { role: 'user', content: rawContext.slice(0, 1800) },
        ];
        try {
            const result = await this.sendCompletionRequest(messages, false);
            const raw = result.choices?.[0]?.message?.content?.trim();
            if (!raw) return '';
            const cleaned = raw.trim().replace(/^"([\s\S]+)"$/, '$1').trim();
            return cleaned.length > 500 ? cleaned.substring(0, 497).trim() + '…' : cleaned;
        } catch (e: any) {
            await logError({
                source: 'engine.ai.highlight-caption',
                errorMessage: `generateHighlightCaption failed (${(e?.message || e).slice(0, 200)})`,
                context: { context: rawContext.slice(0, 120) },
            }).catch(() => {});
            return '';
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
