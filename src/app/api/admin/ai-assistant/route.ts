
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { EDITORIAL_SYSTEM_PROMPT } from '@/lib/engine/prompts';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || '',
});

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { prompt, history = [], currentDraft = null } = body;

        if (!process.env.OPENAI_API_KEY) {
            return NextResponse.json({
                error: 'OPENAI_API_KEY is not configured in .env.local'
            }, { status: 500 });
        }

        const messages: any[] = [
            {
                role: 'system',
                content: `
${EDITORIAL_SYSTEM_PROMPT}

You are an AI Editorial Assistant for KumoLab. Your job is to help the user draft and refine posts.
KumoLab tracks Anime Intel (confirmations, delays, industry news) and Trending (moment-based discussion).

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

        // Add history
        messages.push(...history);

        // Add context of current draft if provided
        if (currentDraft && history.length === 0) {
            messages.push({
                role: 'system',
                content: `The user is currently editing this draft:
Title: ${currentDraft.title}
Content: ${currentDraft.content}
Status: ${currentDraft.status}`
            });
        }

        // Add the new user prompt
        messages.push({ role: 'user', content: prompt });

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages,
            response_format: { type: 'json_object' },
            temperature: 0.7
        });

        const content = response.choices[0].message.content;
        if (!content) throw new Error('Empty response from AI');

        const aiDraft = JSON.parse(content);

        return NextResponse.json({
            success: true,
            draft: aiDraft
        });

    } catch (error: any) {
        console.error('AI Assistant API Error:', error);
        return NextResponse.json({
            error: error.message || 'Internal Server Error'
        }, { status: 500 });
    }
}
