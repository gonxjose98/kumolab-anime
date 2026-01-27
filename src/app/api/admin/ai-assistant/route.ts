import { NextRequest, NextResponse } from 'next/server';
import { AntigravityAI } from '@/lib/engine/ai';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { prompt, history = [], currentDraft = null } = body;

        // Use the centralized Antigravity AI Engine
        const aiEngine = AntigravityAI.getInstance();
        const aiDraft = await aiEngine.processEditorialPrompt({
            prompt,
            history,
            currentDraft
        });

        return NextResponse.json({
            success: true,
            draft: aiDraft
        });

    } catch (error: any) {
        console.error('Antigravity AI Layer Error:', error);
        return NextResponse.json({
            error: error.message || 'Internal Server Error'
        }, { status: 500 });
    }
}
