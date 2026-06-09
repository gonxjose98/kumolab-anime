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
import { stripFancyDashes } from './utils';

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
    // Two clearly-labelled sections. The highlight prompts only ever take an
    // anime/character NAME from OPERATOR NOTES — the source text is vibe-only,
    // because inferring the anime from a tweet caption produces confidently-
    // wrong names (Power→"Fire Force"), which is worse than no name at all.
    const operatorBlock = input.userNotes.trim()
        ? `OPERATOR NOTES (trusted — the only source for the anime/character name): ${input.userNotes.trim()}`
        : `OPERATOR NOTES: (none — do NOT name any anime or character; write generic scene hype)`;
    const sourceBlock = input.originalText.trim()
        ? `SOURCE POST TEXT (vibe only — do NOT use to name the anime, it is unreliable): ${input.originalText.trim().slice(0, 1200)}`
        : `SOURCE POST TEXT: (none)`;
    const rawContext = `${operatorBlock}\n\n${sourceBlock}`;

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

    // No em/en dashes in any KumoLab content (hard rule).
    return {
        title: stripFancyDashes((title || rawTitle).trim()),
        caption: stripFancyDashes((caption || '').trim()),
    };
}
