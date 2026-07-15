import { describe, it, expect } from 'vitest';
import {
    claimRisk,
    isTrailerTrustedSource,
    isPremiumStudio,
} from '@/lib/engine/automation-config';
import {
    extractAnimeCanonical,
    extractSubtitleHash,
    calculateTitleSimilarity,
} from '@/lib/engine/duplicate-prevention';
import { buildFallbackCaption } from '@/lib/engine/caption-fallback';

// Guardrail tests for the pure decision functions the auto-pipeline relies on.
// These have no I/O, so they run fast and catch agent-introduced regressions in
// the risk matrix, dedup logic, and deterministic fallbacks. Added Fable step 8.

describe('claimRisk — risk matrix', () => {
    it('auto-approves T1 trailers', () => {
        expect(claimRisk('TRAILER_DROP', 1)).toBe('AUTO');
    });
    it('routes T3 trailers to review', () => {
        expect(claimRisk('TRAILER_DROP', 3)).toBe('REVIEW');
    });
    it('corroborates a T2 new-season confirmation', () => {
        expect(claimRisk('NEW_SEASON_CONFIRMED', 2)).toBe('CORROBORATE');
    });
    it('is case-insensitive on the claim key', () => {
        expect(claimRisk('trailer_drop', 1)).toBe('AUTO');
    });
    it('rejects unknown claim types (falls back to OTHER)', () => {
        expect(claimRisk('SOMETHING_MADE_UP', 1)).toBe('REJECT');
    });
    it('treats a missing tier as the lowest (t3) risk row', () => {
        // TRAILER_DROP t3 is REVIEW; undefined tier must not be read as t1.
        expect(claimRisk('TRAILER_DROP', undefined)).toBe('REVIEW');
    });
});

describe('isTrailerTrustedSource', () => {
    it('trusts any YouTube channel source', () => {
        expect(isTrailerTrustedSource('YouTube_TOHO Animation')).toBe(true);
    });
    it('trusts AnimeNewsNetwork', () => {
        expect(isTrailerTrustedSource('AnimeNewsNetwork')).toBe(true);
    });
    it('does not trust Crunchyroll News (JS-rendered embeds)', () => {
        expect(isTrailerTrustedSource('Crunchyroll News')).toBe(false);
    });
    it('is safe on null / empty', () => {
        expect(isTrailerTrustedSource(null)).toBe(false);
        expect(isTrailerTrustedSource('')).toBe(false);
    });
});

describe('isPremiumStudio', () => {
    it('matches the TOHO YouTube source (substring, case-insensitive)', () => {
        expect(isPremiumStudio('YouTube_TOHO Animation')).toBe(true);
        expect(isPremiumStudio('youtube_toho animation')).toBe(true);
    });
    it('does not match other tier-1 studios', () => {
        expect(isPremiumStudio('YouTube_Crunchyroll')).toBe(false);
    });
    it('is safe on null / undefined', () => {
        expect(isPremiumStudio(null)).toBe(false);
        expect(isPremiumStudio(undefined)).toBe(false);
    });
});

describe('extractAnimeCanonical', () => {
    it('takes the anime after "from \'...\'"', () => {
        expect(extractAnimeCanonical("New trailer from 'Chainsaw Man'")).toBe('chainsaw man');
    });
    it('falls back to the first quoted string', () => {
        expect(extractAnimeCanonical("'Jujutsu Kaisen' Season 3 confirmed")).toBe('jujutsu kaisen');
    });
    it('strips a season/episode number inside the quote', () => {
        expect(extractAnimeCanonical("'One Piece Season 2' key visual")).toBe('one piece');
    });
    it('returns empty string for empty input', () => {
        expect(extractAnimeCanonical('')).toBe('');
    });
});

describe('extractSubtitleHash', () => {
    it('strips the anime name and normalizes the remaining subtitle', () => {
        const h = extractSubtitleHash("'Chainsaw Man' Episode 5 Preview Released Now");
        expect(h).toBe('episode 5 preview released now');
    });
    it('returns empty for a too-short subtitle', () => {
        expect(extractSubtitleHash("'Naruto' Released")).toBe('');
    });
});

describe('calculateTitleSimilarity', () => {
    it('is 1 for identical titles', () => {
        expect(calculateTitleSimilarity('Chainsaw Man trailer', 'Chainsaw Man trailer')).toBe(1);
    });
    it('is 0 for fully disjoint titles', () => {
        expect(calculateTitleSimilarity('Chainsaw Man', 'Spy Family')).toBe(0);
    });
    it('is between 0 and 1 for partial overlap', () => {
        const s = calculateTitleSimilarity('Chainsaw Man new trailer', 'Chainsaw Man key visual');
        expect(s).toBeGreaterThan(0);
        expect(s).toBeLessThan(1);
    });
    it('is 0 when either title has no usable words', () => {
        expect(calculateTitleSimilarity('', 'Chainsaw Man')).toBe(0);
    });
});

describe('buildFallbackCaption', () => {
    it('is deterministic for the same input', () => {
        const a = buildFallbackCaption({ title: "'Chainsaw Man' new trailer", claim_type: 'TRAILER_DROP' });
        const b = buildFallbackCaption({ title: "'Chainsaw Man' new trailer", claim_type: 'TRAILER_DROP' });
        expect(a).toBe(b);
        expect(a.length).toBeGreaterThan(0);
    });
    it('never exceeds the 200-char caption cap', () => {
        const long = 'A '.repeat(300) + 'ending';
        const out = buildFallbackCaption({ title: long, claim_type: 'OTHER' });
        expect(out.length).toBeLessThanOrEqual(200);
    });
});
