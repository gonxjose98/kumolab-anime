import { EDITORIAL_SYSTEM_PROMPT } from './prompts';

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

    private constructor() {
        // Strict Configuration: No default to OpenAI
        // The user must provide an endpoint or we fail.
        this.baseURL = process.env.ANTIGRAVITY_AI_ENDPOINT || '';
        this.apiKey = process.env.ANTIGRAVITY_AI_KEY || 'internal-bearer';
        this.model = process.env.ANTIGRAVITY_AI_MODEL || 'antigravity-1.0';

        if (!this.baseURL) {
            console.warn("[AntigravityAI] Warning: ANTIGRAVITY_AI_ENDPOINT is not set. AI features will fail.");
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
        if (!this.baseURL) {
            throw new Error("Antigravity AI Configuration Missing: ANTIGRAVITY_AI_ENDPOINT is not set in .env.local");
        }

        const url = `${this.baseURL}/chat/completions`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: messages,
                    temperature: 0.7,
                    response_format: jsonMode ? { type: 'json_object' } : undefined
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`AI Engine HTTP ${response.status}: ${errText}`);
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
