// Shared shapes for the Explore digest -> model -> validator -> UI pipeline.
// Pure types only, safe to import from client components.

export type Section = 'world' | 'ours' | 'system';

/** One citable fact. The model cites these by `ref`; the UI renders them as sources. */
export interface SourceRef {
    kind: 'post' | 'url' | 'metric' | 'anilist' | 'system';
    label: string;
    /** Human sentence with the exact figures, as the model sees them. */
    text: string;
    url?: string;
    /** Every number this source vouches for (used by the number check). */
    values: number[];
}

export interface Digest {
    section: Section;
    generatedAt: string;
    /** Structured facts handed to the model. Every leaf that matters carries a `ref`. */
    facts: Record<string, unknown>;
    refs: Record<string, SourceRef>;
    /** Inputs that were unavailable this run (shown in the UI footer). */
    missing: string[];
    /** True when there is enough data to be worth a model call. */
    hasData: boolean;
}

export const CARD_TYPES: Record<Section, readonly string[]> = {
    world: ['trending', 'news', 'premiere'],
    ours: ['trend_up', 'trend_down', 'format', 'timing', 'top_post', 'followers'],
    system: ['system'],
};

/** What the model returns per card (sources are ref ids only). */
export interface RawCard {
    type: string;
    kind: 'fact' | 'recommendation';
    title: string;
    why: string;
    details: string;
    recommendation: string;
    sources: string[];
    anime: string;
    confidence: 'high' | 'medium' | 'low';
}

/** A card after validation, ready to insert / render. */
export interface Card {
    section: Section;
    type: string;
    kind: 'fact' | 'recommendation';
    title: string;
    why: string;
    details: string | null;
    recommendation: string | null;
    sources: (SourceRef & { ref: string })[];
    anime: string | null;
    confidence: 'high' | 'medium' | 'low';
    rank: number;
}

export interface Drop {
    section: Section;
    title: string;
    reason: string;
}

/** Row shape of explore_insights as the page reads it. */
export interface InsightRow {
    id: string;
    section: Section;
    type: string;
    kind: 'fact' | 'recommendation';
    title: string;
    why: string;
    details: string | null;
    recommendation: string | null;
    sources: (SourceRef & { ref: string })[];
    anime: string | null;
    confidence: 'high' | 'medium' | 'low';
    rank: number;
    created_at: string;
}
