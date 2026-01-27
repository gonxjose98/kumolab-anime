import OpenAI from 'openai';
import { EDITORIAL_SYSTEM_PROMPT } from './prompts';

/**
 * Antigravity AI Engine
 * Single source of truth for all AI-assisted content generation and refinement.
 * This layer handles model selection, prompt management, and history.
 * 
 * It is designed to route through Antigravity's internal AI gateway,
 * unifying manual and automated workflows.
 */
export class AntigravityAI {
    private static instance: AntigravityAI;
    private client: OpenAI | null = null;
    private model: string;

    private constructor() {
        // Use Antigravity's internal engine configuration
        // This abstracts away direct model provider dependencies in the component layer
        const apiKey = process.env.ANTIGRAVITY_AI_KEY || process.env.OPENAI_API_KEY || 'internal';
        const baseURL = process.env.ANTIGRAVITY_AI_ENDPOINT || 'https://api.openai.com/v1';

        this.model = process.env.ANTIGRAVITY_AI_MODEL || 'gpt-4o-mini';

        this.client = new OpenAI({
            apiKey,
            baseURL
        });
    }

    public static getInstance(): AntigravityAI {
        if (!AntigravityAI.instance) {
            AntigravityAI.instance = new AntigravityAI();
        }
        return AntigravityAI.instance;
    }

    /**
     * Editorial Assist: Used for manual drafting and iterative refinement in the admin panel.
     */
    public async processEditorialPrompt(params: {
        prompt: string;
        history?: any[];
        currentDraft?: any;
    }) {
        if (!this.client) throw new Error('Antigravity AI Engine not initialized');

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

        const response = await this.client.chat.completions.create({
            model: this.model,
            messages,
            response_format: { type: 'json_object' },
            temperature: 0.7
        });

        const content = response.choices[0].message.content;
        if (!content) throw new Error('Empty response from Antigravity AI');

        return JSON.parse(content);
    }

    /**
     * Auto Engine: Used by the background automation to generate high-quality posts from raw intel.
     * This ensures the same "Editorial Truth" is used for automated and manual posts.
     */
    public async generateFromIntel(sourceData: string, type: 'INTEL' | 'TRENDING') {
        if (!this.client) throw new Error('Antigravity AI Engine not initialized');

        const messages: any[] = [
            {
                role: 'system',
                content: `${EDITORIAL_SYSTEM_PROMPT}\n\nYou are the background automation engine. Generate a post based on the following raw data.`
            },
            { role: 'user', content: sourceData }
        ];

        const response = await this.client.chat.completions.create({
            model: this.model,
            messages,
            response_format: { type: 'json_object' }
        });

        const content = response.choices[0].message.content;
        return content ? JSON.parse(content) : null;
    }
}
