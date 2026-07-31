import { describe, it, expect } from 'vitest';
import { animeSearchCandidates } from '@/lib/engine/anilist-validator';

// Regression cover for the 2026-07-31 defect: the popularity fallback passed the
// whole KumoLab headline to AniList, which matches nothing, so every untracked
// post scored 0/40 and stayed at 60. It survived review because the tests used
// clean names like "Naruto" — production titles never look like that.
describe('animeSearchCandidates', () => {
    it('pulls the quoted series name out of a KumoLab headline', () => {
        const c = animeSearchCandidates("'BanG Dream! Ave Mujica' Film Trailer Reveals October 16 Opening");
        expect(c[0]).toBe('BanG Dream! Ave Mujica');
    });

    it('offers shorter prefixes so long official subtitles still resolve', () => {
        // "Fate/Grand Order - Ordeal Call III: ..." finds nothing on AniList,
        // but "Fate/Grand Order" does.
        const c = animeSearchCandidates("'Fate/Grand Order - Ordeal Call III: Bellum Novae Humanitatis' PV");
        expect(c[0]).toBe('Fate/Grand Order - Ordeal Call III: Bellum Novae Humanitatis');
        expect(c).toContain('Fate/Grand Order');
    });

    it('handles curly quotes from the AI formatter', () => {
        expect(animeSearchCandidates('‘Gachiakuta’ Season 2 Announced')[0]).toBe('Gachiakuta');
    });

    it('falls back to leading words when nothing is quoted', () => {
        const c = animeSearchCandidates('Attack on Titan Final Season Part 4 Announced');
        expect(c).toContain('Attack on Titan Final');
    });

    it('never emits duplicates or fragments shorter than 2 chars', () => {
        const c = animeSearchCandidates("'Bleach' Returns");
        expect(new Set(c).size).toBe(c.length);
        expect(c.every(s => s.length >= 2)).toBe(true);
    });
});
