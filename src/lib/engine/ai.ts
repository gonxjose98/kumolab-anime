import { EDITORIAL_SYSTEM_PROMPT } from './prompts';
import { buildFallbackCaption } from './caption-fallback';
import { logError } from '../logging/structured-logger';

/**
 * Antigravity AI Engine
 * Single source of truth for all AI-assisted content generation and refinement.
 * 
 * ARCHITECTURE UPDATE:
 * - Removed OpenAI SDK dependency.
 * - Uses native fetch for protocol-agnostic API calls.
 * - Routes exclusively to ANTIGRAVITY_AI_ENDPOINT.
 */
export class AntigravityAI {
    private static instance: AntigravityAI;
    private baseURL: string;
    private apiKey: string;
    private model: string;
    private provider: 'antigravity' | 'openai';

    private constructor() {
        // Check for Antigravity config first, fallback to OpenAI, then Kimi
        const antigravityEndpoint = process.env.ANTIGRAVITY_AI_ENDPOINT;
        const openAIKey = process.env.OPENAI_API_KEY;
        const kimiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
        
        // DEBUG: Log env var availability (don't log the actual keys!)
        console.log('[AntigravityAI] Env check:', {
            hasAntigravity: !!antigravityEndpoint,
            hasOpenAI: !!openAIKey,
            hasKimi: !!kimiKey,
            kimiKeyLength: kimiKey ? kimiKey.length : 0
        });
        
        if (antigravityEndpoint) {
            // Use Antigravity AI
            this.provider = 'antigravity';
            this.baseURL = antigravityEndpoint;
            this.apiKey = process.env.ANTIGRAVITY_AI_KEY || 'internal-bearer';
            this.model = process.env.ANTIGRAVITY_AI_MODEL || 'antigravity-1.0';
            console.log("[AntigravityAI] Using Antigravity AI provider");
        } else if (kimiKey) {
            // Use Kimi/Moonshot - CORRECT ENDPOINT from OpenClaw config
            this.provider = 'openai'; // Kimi uses OpenAI-compatible API
            this.baseURL = 'https://api.moonshot.ai/v1'; // NOT .cn - this is the correct endpoint
            this.apiKey = kimiKey;
            this.model = process.env.KIMI_MODEL || 'kimi-k2.5';
            console.log("[AntigravityAI] Using Kimi/Moonshot provider with model:", this.model);
            console.log("[AntigravityAI] Key starts with sk-:", kimiKey.startsWith('sk-'));
        } else if (openAIKey) {
            // Fallback to OpenAI
            this.provider = 'openai';
            this.baseURL = 'https://api.openai.com/v1';
            this.apiKey = openAIKey;
            this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
            console.log("[AntigravityAI] Using OpenAI provider with model:", this.model);
        } else {
            // No AI provider configured
            this.provider = 'antigravity';
            this.baseURL = '';
            this.apiKey = '';
            this.model = '';
            console.warn("[AntigravityAI] Warning: No AI provider configured. Set ANTIGRAVITY_AI_ENDPOINT, KIMI_API_KEY, or OPENAI_API_KEY.");
        }
    }

    public static getInstance(): AntigravityAI {
        if (!AntigravityAI.instance) {
            AntigravityAI.instance = new AntigravityAI();
        }
        return AntigravityAI.instance;
    }

    /**
     * Internal Fetch Wrapper
     * Sends standard chat completion payload to the configured endpoint.
     */
    private async sendCompletionRequest(messages: any[], jsonMode: boolean = true): Promise<any> {
        if (!this.baseURL || !this.apiKey) {
            throw new Error("AI Configuration Missing: Set ANTIGRAVITY_AI_ENDPOINT or OPENAI_API_KEY in environment variables.");
        }

        const url = `${this.baseURL}/chat/completions`;

        try {
            const requestBody: any = {
                model: this.model,
                messages: messages,
                temperature: 1,
            };
            
            // Only add response_format for OpenAI models that support it
            if (jsonMode && this.provider === 'openai' && this.model.includes('gpt-4')) {
                requestBody.response_format = { type: 'json_object' };
            }
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                // Compact the body. When ollama.kumolabanime.com goes down
                // Cloudflare returns a multi-KB HTML error page — dumping
                // that into error_logs makes the dashboard error popover
                // unreadable. Strip tags, collapse whitespace, cap to 200
                // chars. The HTTP status carries the actual signal anyway.
                const raw = await response.text();
                const compact = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                const trimmed = compact.length > 200 ? compact.slice(0, 200) + '…' : compact;
                throw new Error(`AI Engine HTTP ${response.status}${trimmed ? `: ${trimmed}` : ''}`);
            }

            const data = await response.json();
            return data;

        } catch (error: any) {
            console.error("[AntigravityAI] Request Fetch Error:", error);
            throw error;
        }
    }

    /**
     * Editorial Assist: Used for manual drafting and iterative refinement in the admin panel.
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

You are the Antigravity AI Editorial Assistant for KumoLab. 
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

        // Add history/context
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

        if (!content) throw new Error('Empty response from AI Engine');

        try {
            return JSON.parse(content);
        } catch (e) {
            console.error("JSON Parse Error on AI response:", content);
            throw new Error("AI returned malformed JSON");
        }
    }

    /**
     * Translate Japanese (or any non-English) text to English.
     * Returns { title, content } with translated text, or original if already English.
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

        const result = await this.sendCompletionRequest(messages, true);
        const response = result.choices?.[0]?.message?.content;
        if (!response) throw new Error('Empty translation response');

        try {
            const parsed = JSON.parse(response);
            return { title: parsed.title || title, content: parsed.content || content };
        } catch {
            // If JSON parse fails, try to extract from response
            console.warn('[AntigravityAI] Translation JSON parse failed, returning original');
            return { title, content };
        }
    }

    /**
     * Format a title to KumoLab's two-line standard.
     * Returns the formatted title string.
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

        const result = await this.sendCompletionRequest(messages, false);
        const response = result.choices?.[0]?.message?.content?.trim();
        if (!response) return rawTitle;
        return response;
    }

    /**
     * Generates a 1–2 sentence KumoLab-voice caption for a post. Replaces the
     * truncated raw RSS description we used to dump into `excerpt`. Different
     * claim types get different hooks (trailer = "why you should care", season
     * confirmation = the news in plain terms, etc.).
     *
     * Returns the caption string. Always under 200 chars. Falls back to a
     * sanitized version of the source content on any failure so the post still
     * has *something* readable.
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
            // Strip wrapping quotes if the model added them anyway.
            const cleaned = raw.replace(/^["']|["']$/g, '').trim();
            return cleaned.length > 200 ? cleaned.substring(0, 197).trim() + '…' : cleaned;
        } catch (e: any) {
            // Caption AI is intermittently down (ollama upstream 530s). Log it
            // so we know, then use the deterministic template fallback. This
            // produces a real KumoLab-voice line instead of dumping the raw
            // content/title — much closer to what the AI would have written.
            await logError({
                source: 'engine.ai.caption',
                errorMessage: `generateCaption failed (${e?.message || e}); using deterministic fallback`,
                context: { title: title.substring(0, 120), claim_type: claim },
            }).catch(() => {});
            return buildFallbackCaption({ title, claim_type: claim, source });
        }
    }

    /**
     * Tone + safety gate for auto-publish. Runs AFTER the post copy is drafted,
     * BEFORE it enters the scheduled queue. Returns structured booleans so the
     * auto-approval engine can decide to publish or defer to human review.
     *
     * Cheap enough to run on every auto-candidate — uses the same Kimi/OpenAI backend.
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
            // Fail closed — if the safety pass can't run, treat as not safe for auto.
            return {
                on_brand: false,
                safe: false,
                factually_hedged: false,
                confidence: 0,
                reason: `safety check error: ${e.message || 'unknown'}`,
            };
        }
    }

    /**
     * Auto Engine: Used by the background automation to generate high-quality posts from raw intel.
     */
    public async generateFromIntel(sourceData: string, type: 'INTEL' | 'TRENDING') {
        const messages: any[] = [
            {
                role: 'system',
                content: `${EDITORIAL_SYSTEM_PROMPT}\n\nYou are the background automation engine. Generate a post based on the following raw data.`
            },
            { role: 'user', content: sourceData }
        ];

        const result = await this.sendCompletionRequest(messages, true);
        const content = result.choices?.[0]?.message?.content;

        return content ? JSON.parse(content) : null;
    }
}
