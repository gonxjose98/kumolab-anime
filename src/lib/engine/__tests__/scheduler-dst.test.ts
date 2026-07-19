import { describe, it, expect } from 'vitest';
import { easternOffsetHours } from '../scheduler';

/**
 * Regression guard for the DST bug: production's Intl was returning EST (UTC-5)
 * for America/New_York year-round, so peak slots fired an hour late in summer.
 * easternOffsetHours computes the US-Eastern offset from the DST rules directly,
 * so it must be 4 (EDT) in summer and 5 (EST) in winter regardless of runtime tz.
 */
describe('easternOffsetHours (deterministic US-Eastern DST)', () => {
    it('is EDT (4) in the middle of summer', () => {
        expect(easternOffsetHours(new Date('2026-07-18T17:00:00Z'))).toBe(4);
        expect(easternOffsetHours(new Date('2025-06-01T12:00:00Z'))).toBe(4);
    });

    it('is EST (5) in the middle of winter', () => {
        expect(easternOffsetHours(new Date('2026-01-18T17:00:00Z'))).toBe(5);
        expect(easternOffsetHours(new Date('2026-12-25T12:00:00Z'))).toBe(5);
    });

    it('flips at the DST boundaries (2nd Sun Mar 07:00 UTC, 1st Sun Nov 06:00 UTC)', () => {
        // 2026 DST: starts 2026-03-08 07:00 UTC, ends 2026-11-01 06:00 UTC.
        expect(easternOffsetHours(new Date('2026-03-08T06:59:00Z'))).toBe(5); // just before → EST
        expect(easternOffsetHours(new Date('2026-03-08T07:00:00Z'))).toBe(4); // at start → EDT
        expect(easternOffsetHours(new Date('2026-11-01T05:59:00Z'))).toBe(4); // just before → EDT
        expect(easternOffsetHours(new Date('2026-11-01T06:00:00Z'))).toBe(5); // at end → EST
    });

    it('a 13:00 ET summer slot maps to 17:00 UTC (not the buggy 18:00)', () => {
        // 13:00 ET in July = 13:00 + 4h = 17:00 UTC.
        const utc17 = new Date('2026-07-18T17:00:00Z');
        expect(17 - easternOffsetHours(utc17)).toBe(13);
    });
});
