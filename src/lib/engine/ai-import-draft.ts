/**
 * ai-import-draft.ts
 *
 * Drafts a KumoLab-voice title + caption for operator-imported videos
 * (X / Instagram). Reuses the existing AI singleton's formatKumoLabTitle()
 * and generateCaption() so the editorial voice is identical to the
 * auto-pipeline. Both calls have deterministic fallbacks built in.
 *
 * Inputs:
 *   - platform: 'x' | 'instagram' (used only for source attribution in the
 *     fallback caption when AI is unreachable)
 *   - originalText: best available text context from the source (yt-dlp's
 *     description / fulltitle for IG, the tweet text for X). May be empty.
 *   - userNotes: optional operator-supplied brief ("Studio MAPPA dropped
 *     Chainsaw S2 ED preview"). When present, weighted heavier than
 *     originalText since the operator knows what they're posting.
 *
 * Output: { title, caption }. Both fields always populated — fallbacks
 * inside the AI module guarantee non-empty strings even with zero AI
 * providers configured.
 */

import { AntigravityAI } from './ai';

export interface ImportDraftInput {
    platform: 'x' | 'instagram';
    originalText: string;
    userNotes: string;
}

export interface ImportDraft {
    title: string;
    caption: string;
}

export async function draftImportedPost(input: ImportDraftInput): Promise<ImportDraft> {
    const ai = AntigravityAI.getInstance();

    // Build the raw context the AI will work from. Operator notes go FIRST
    // — they're the operator's editorial brief and should dominate when
    // they conflict with whatever the original post said. originalText is
    // appended as supplementary detail.
    const noteBlock = input.userNotes.trim()
        ? `Operator note: ${input.userNotes.trim()}\n\n`
        : '';
    const sourceBlock = input.originalText.trim()
        ? `Original ${input.platform.toUpperCase()} post text: ${input.originalText.trim().slice(0, 1500)}`
        : `(No source text available — generate from operator note only.)`;
    const rawContext = `${noteBlock}${sourceBlock}`;

    // The title formatter expects a (rawTitle, rawContent) pair. Use the
    // first ~80 chars of the operator note as the working title — if none
    // provided, fall back to a slice of the source text — the formatter
    // will rewrite either into KumoLab voice anyway.
    const rawTitle = (input.userNotes.trim() || input.originalText.trim() || 'Imported anime post')
        .replace(/\s+/g, ' ')
        .slice(0, 120);

    // Imports are HIGHLIGHT clips (fight scenes, sakuga, aesthetic moments) —
    // NOT news. Use the highlight prompts so we hype the scene without
    // fabricating a release / trailer / announcement.
    const [title, caption] = await Promise.all([
        ai.formatHighlightTitle(rawContext),
        ai.generateHighlightCaption(rawContext),
    ]);

    return {
        title: (title || rawTitle).trim(),
        caption: (caption || '').trim(),
    };
}
