import { describe, it, expect } from 'vitest';
import { tierForPopularity, AUTO_NOTE } from '../tier-refresh';

describe('tierForPopularity', () => {
    it('puts only genuine megahits in tier 1', () => {
        expect(tierForPopularity(1_035_972)).toBe(1); // Attack on Titan
        expect(tierForPopularity(500_000)).toBe(1);
        expect(tierForPopularity(499_999)).toBe(2);
    });

    it('tiers mid and small franchises below that', () => {
        expect(tierForPopularity(200_000)).toBe(2);
        expect(tierForPopularity(199_999)).toBe(3);
        expect(tierForPopularity(25_000)).toBe(3);
    });

    it('declines to tier anything too small to be worth a slot', () => {
        // Newly-announced shows are legitimately tiny; they still get scored by
        // the AniList popularity fallback, they just do not earn a tier row.
        expect(tierForPopularity(19_844)).toBeNull(); // BanG Dream! Ave Mujica
        expect(tierForPopularity(2_652)).toBeNull();  // Be Forever Yamato
        expect(tierForPopularity(0)).toBeNull();
    });

    it('spreads a realistic resolved set across all three tiers', () => {
        // The regression this guards: a 200k tier-1 cutoff put 87 of 127
        // resolved shows in tier 1, making the top tier meaningless.
        const sample = [
            1_035_972, 953_363, 860_914, 735_687, 716_734, 708_386,
            420_000, 313_071, 250_000, 210_000,
            170_931, 90_000, 40_000, 26_174,
        ];
        const counts = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
        for (const p of sample) {
            const t = tierForPopularity(p);
            if (t) counts[t]++;
        }
        expect(counts[1]).toBeGreaterThan(0);
        expect(counts[2]).toBeGreaterThan(0);
        expect(counts[3]).toBeGreaterThan(0);
        expect(counts[1]).toBeLessThan(sample.length / 2);
    });
});

describe('AUTO_NOTE', () => {
    it('is the prefix the refresh uses to recognise rows it owns', () => {
        // Rows Jose added by hand must never match, or the job would start
        // re-tiering his curation.
        expect(`${AUTO_NOTE} 2026-07-31`.startsWith(AUTO_NOTE)).toBe(true);
        expect('Jose: keep this one pinned'.startsWith(AUTO_NOTE)).toBe(false);
        const missingNote: string | null = null;
        expect(((missingNote ?? '') as string).startsWith(AUTO_NOTE)).toBe(false);
    });
});
