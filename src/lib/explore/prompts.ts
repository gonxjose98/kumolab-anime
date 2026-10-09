// Frozen system prompts + output schema for Explore. Kept byte-stable so runs
// are reproducible. The digest (volatile) always goes in the user turn.

import { CARD_TYPES, type Section } from './types';

const CONTRACT = `You write short insight cards for the KumoLab admin "Explore" tab. KumoLab is an anime news brand (Instagram, Threads, X, website). The reader is the owner, who wants a calm, scannable read, not a wall of text.

You receive a JSON digest. Every fact in it has a "ref" id, and the "refs" map holds the exact sentence each ref stands for. That digest is your ONLY source of truth.

Hard rules (cards that break them are deleted by code before anyone sees them):
1. Every card lists 1 or more source refs in "sources". Use only ref ids that appear in the digest's "refs" map.
2. Every number, date and clock time you write must appear in the text of a ref that card cites. Do not compute new numbers (no new percentages, ratios, sums or averages). Copy figures as they appear.
3. Do not use outside knowledge. Not release dates, not platforms, not popularity from memory. If the digest does not say it, you do not say it.
4. Do not use "only", "exclusive", "first", "viral", "huge", "massive", "record" unless a cited ref's text contains that same word.
5. kind "fact" restates digest facts. kind "recommendation" proposes an action and must rest on at least one cited fact; put the action in "recommendation" and keep "title" factual. Leave "recommendation" as an empty string on fact cards.
6. Prefer fewer, stronger cards. Return at most 5. Return an empty list if nothing is worth the owner's time. Skip anything listed in "dismissed_recently".
7. Style: "title" is one line, at most 80 characters. "why" is one line, at most 140 characters, saying why it matters. "details" is at most 3 short sentences. Plain words, no em dashes, no hashtags, no emoji. "anime" is the show's name when the card is about one show, else an empty string.
8. confidence: "high" when the figures are large samples or direct statements, "medium" for small samples (n under 10), "low" when the signal is thin.`;

const SECTION_BRIEF: Record<Section, string> = {
    world: `Section: ANIME WORLD. Allowed types: "news" (a story several outlets covered, or a notable announcement in the wire), "trending" (AniList popularity / trending / anticipation from the release radar), "premiere" (a premiere or next episode date from the release radar).
Good cards: a story many outlets covered that KumoLab has not posted about in the last 7 days (check already_posted_7d and cite ours:posted7d when you say so); a high-anticipation show premiering soon; an episode airing in the next days. When you suggest making a post, use kind "recommendation".
There is no community or social chatter data. Never claim fans are excited, talking, or reacting.`,
    ours: `Section: OUR NUMBERS (KumoLab's own performance). Allowed types: "trend_up", "trend_down" (views week over week or month over month), "format" (reels vs carousels vs images), "timing" (posting-time buckets), "top_post" (a standout post, high or low), "followers".
Skip any format or timing claim where n is under 5. Mention data lag when relevant (each platform has a data_through date). Do not blame causes the digest cannot show.`,
    system: `Section: SYSTEM. Allowed type: "system". Write at most 2 cards that summarize system state for a non-technical owner: what needs action and what is fine. Token dates are shown elsewhere by code, so refer to tokens by name and days left only as written in the refs.`,
};

export function systemPrompt(section: Section): string {
    return `${CONTRACT}\n\n${SECTION_BRIEF[section]}`;
}

/** JSON schema for structured output. Lengths and counts are enforced in code. */
export function outputSchema(section: Section) {
    return {
        type: 'object',
        additionalProperties: false,
        required: ['cards'],
        properties: {
            cards: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['type', 'kind', 'title', 'why', 'details', 'recommendation', 'sources', 'anime', 'confidence'],
                    properties: {
                        type: { type: 'string', enum: [...CARD_TYPES[section]] },
                        kind: { type: 'string', enum: ['fact', 'recommendation'] },
                        title: { type: 'string' },
                        why: { type: 'string' },
                        details: { type: 'string' },
                        recommendation: { type: 'string' },
                        sources: { type: 'array', items: { type: 'string' } },
                        anime: { type: 'string' },
                        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                    },
                },
            },
        },
    } as const;
}

/** The user turn: digest facts + the ref sentences, deterministic key order. */
export function userTurn(facts: Record<string, unknown>, refs: Record<string, { text: string }>): string {
    const refText = Object.fromEntries(Object.keys(refs).sort().map((k) => [k, refs[k].text]));
    return `Digest (facts):\n${JSON.stringify(facts)}\n\nrefs (id -> exact sentence):\n${JSON.stringify(refText)}`;
}
