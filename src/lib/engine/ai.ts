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
    private provider: 'antigravity' | 'openai';

    private constructor() {
        // Check for Antigravity config first, fallback to OpenAI, then Kimi
        const antigravityEndpoint = process.env.ANTIGRAVITY_AI_ENDPOINT;
        const openAIKey = process.env.OPENAI_API_KEY;
        const kimiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
        
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
                temperature: 0.7,
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
