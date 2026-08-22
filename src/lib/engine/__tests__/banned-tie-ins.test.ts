import { describe, it, expect } from 'vitest';
import { CONTENT_RULES } from '../sources-config';

/**
 * Toy / brick tie-in ban (Jose, 2026-08-22).
 *
 * "LEGO One Piece" published four times between 2026-07-20 and 2026-08-22
 * despite being explicitly banned, because the rule lived only in
 * conversation and was never added to NEGATIVE_KEYWORDS.
 *
 * NEGATIVE_KEYWORDS is substring-matched at every ingestion checkpoint, so
 * this suite also pins the collision cases that forced 'lego ' to carry a
 * trailing space: Beastars' Legoshi and the word "allegory".
 */
const firstNegativeHit = (title: string): string | null =>
    CONTENT_RULES.NEGATIVE_KEYWORDS.find((k) => title.toLowerCase().includes(k.toLowerCase())) ?? null;

describe('toy / brick tie-in ban', () => {
    it.each([
        "'Lego One Piece Animated Special' Trailer Highlights Usopp's Tall Tale",
        'LEGO ONE PIECE | Official Trailer | Netflix',
        "'LEGO One Piece' New Official Teaser Trailer Released • Premieres March",
        'LEGO Ninjago Dragons Rising Season 3 Trailer',
    ])('blocks %s', (title) => {
        expect(firstNegativeHit(title)).not.toBeNull();
    });

    it.each([
        ['Beastars (Legoshi shares the "lego" substring)', 'BEASTARS Final Season: Legoshi and Louis Return'],
        ['the word "allegory"', 'An allegory of war: Saga of Tanya the Evil II Episode 7 PV'],
        ['an ordinary trailer', "'The Apothecary Diaries' Season 3 Main PV Released"],
    ])('does NOT block %s', (_label, title) => {
        expect(firstNegativeHit(title)).toBeNull();
    });
});
