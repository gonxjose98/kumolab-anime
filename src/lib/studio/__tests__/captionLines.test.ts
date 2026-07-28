import { describe, it, expect } from 'vitest';
import { groupIntoLines, activeWordIndex, DEFAULT_GROUP } from '@/lib/studio/captionLines';
import { normalizeWords } from '@/lib/studio/transcribe';

const w = (text: string, start: number, end: number) => ({ text, start, end });

describe('groupIntoLines', () => {
    it('caps a line at maxWords', () => {
        const words = Array.from({ length: 9 }, (_, i) => w(`w${i}`, i * 0.3, i * 0.3 + 0.25));
        const lines = groupIntoLines(words, { maxWords: 4, gapSec: 99, maxChars: 999, maxDurationSec: 99 });
        expect(lines.map((l) => l.words.length)).toEqual([4, 4, 1]);
    });

    it('breaks on a silence longer than gapSec', () => {
        const lines = groupIntoLines([
            w('hello', 0, 0.4),
            w('there', 0.4, 0.8),
            // 1.2s of silence
            w('again', 2.0, 2.4),
        ], { gapSec: 0.6, maxWords: 99, maxChars: 999, maxDurationSec: 99 });
        expect(lines).toHaveLength(2);
        expect(lines[1].text).toBe('again');
    });

    it('breaks after sentence-final punctuation', () => {
        const lines = groupIntoLines([
            w('Go.', 0, 0.3),
            w('Now', 0.3, 0.6),
        ], { maxWords: 99, maxChars: 999, gapSec: 99, maxDurationSec: 99 });
        expect(lines.map((l) => l.text)).toEqual(['Go.', 'Now']);
    });

    it('breaks on Japanese sentence-final punctuation too', () => {
        const lines = groupIntoLines([
            w('やめろ。', 0, 0.4),
            w('待て', 0.4, 0.8),
        ], { maxWords: 99, maxChars: 999, gapSec: 99, maxDurationSec: 99 });
        expect(lines).toHaveLength(2);
    });

    it('breaks before a line overruns maxChars', () => {
        const lines = groupIntoLines([
            w('extraordinarily', 0, 0.5),
            w('complicated', 0.5, 1.0),
        ], { maxChars: 20, maxWords: 99, gapSec: 99, maxDurationSec: 99 });
        expect(lines).toHaveLength(2);
    });

    it('breaks before a line lingers past maxDurationSec', () => {
        const lines = groupIntoLines([
            w('a', 0, 0.2),
            w('b', 0.3, 3.9),
        ], { maxDurationSec: 3, maxWords: 99, maxChars: 999, gapSec: 99 });
        expect(lines).toHaveLength(2);
    });

    it('spans each line from its first word start to its last word end', () => {
        const lines = groupIntoLines([w('a', 1.0, 1.2), w('b', 1.3, 1.9)], { maxWords: 4 });
        expect(lines[0].start).toBeCloseTo(1.0);
        expect(lines[0].end).toBeCloseTo(1.9);
        expect(lines[0].text).toBe('a b');
    });

    it('returns nothing for no words', () => {
        expect(groupIntoLines([])).toEqual([]);
    });

    it('keeps lines short by default (TikTok burst, not a subtitle)', () => {
        expect(DEFAULT_GROUP.maxWords).toBeLessThanOrEqual(5);
    });
});

describe('a real transcript', () => {
    // Verbatim OpenAI whisper-1 output (2026-07-28) for the line
    // "This anime trailer just dropped and it looks absolutely incredible."
    // Synthetic evenly-spaced words hide grouping problems that real, uneven
    // speech timings expose.
    const real = [
        { text: 'This', start: 0, end: 0.23999999463558197 },
        { text: 'anime', start: 0.23999999463558197, end: 0.5600000023841858 },
        { text: 'trailer', start: 0.5600000023841858, end: 0.8600000143051147 },
        { text: 'just', start: 0.8600000143051147, end: 1.2999999523162842 },
        { text: 'dropped', start: 1.2999999523162842, end: 1.6399999856948853 },
        { text: 'and', start: 1.6399999856948853, end: 2.059999942779541 },
        { text: 'it', start: 2.059999942779541, end: 2.200000047683716 },
        { text: 'looks', start: 2.200000047683716, end: 2.4200000762939453 },
        { text: 'absolutely', start: 2.4200000762939453, end: 3.059999942779541 },
        { text: 'incredible', start: 3.059999942779541, end: 3.559999942779541 },
    ];

    it('splits into short bursts rather than one long subtitle', () => {
        const lines = groupIntoLines(real);
        expect(lines.length).toBeGreaterThanOrEqual(3);
        for (const l of lines) {
            expect(l.words.length).toBeLessThanOrEqual(DEFAULT_GROUP.maxWords);
            expect(l.text.length).toBeLessThanOrEqual(DEFAULT_GROUP.maxChars + 12);
        }
    });

    it('loses no words and keeps them in order', () => {
        const lines = groupIntoLines(real);
        expect(lines.flatMap((l) => l.words.map((w) => w.text))).toEqual(real.map((w) => w.text));
    });

    it('covers the full span with non-overlapping lines', () => {
        const lines = groupIntoLines(real);
        expect(lines[0].start).toBeCloseTo(0);
        expect(lines[lines.length - 1].end).toBeCloseTo(3.56, 2);
        for (let i = 1; i < lines.length; i++) {
            expect(lines[i].start).toBeGreaterThanOrEqual(lines[i - 1].end - 1e-9);
        }
    });

    it('has a highlighted word at any moment inside a line', () => {
        const lines = groupIntoLines(real);
        for (const l of lines) {
            const mid = (l.start + l.end) / 2 - l.start;
            expect(activeWordIndex(l.words.map((w) => ({ ...w, start: w.start - l.start, end: w.end - l.start })), mid))
                .toBeGreaterThanOrEqual(0);
        }
    });
});

describe('activeWordIndex', () => {
    const words = [w('one', 0, 0.5), w('two', 0.5, 1.0), w('three', 1.4, 2.0)];

    it('finds the word being spoken', () => {
        expect(activeWordIndex(words, 0.1)).toBe(0);
        expect(activeWordIndex(words, 0.6)).toBe(1);
        expect(activeWordIndex(words, 1.5)).toBe(2);
    });

    it('is inclusive of start and exclusive of end, so boundaries never double-highlight', () => {
        expect(activeWordIndex(words, 0.5)).toBe(1);
        expect(activeWordIndex(words, 1.0)).toBe(-1);
    });

    it('clears the highlight during a pause rather than sticking', () => {
        expect(activeWordIndex(words, 1.2)).toBe(-1);
    });

    it('returns -1 before and after', () => {
        expect(activeWordIndex(words, -1)).toBe(-1);
        expect(activeWordIndex(words, 99)).toBe(-1);
    });
});

describe('normalizeWords', () => {
    it('drops blanks and trims', () => {
        expect(normalizeWords([
            { text: '  hi  ', start: 0, end: 0.3 },
            { text: '   ', start: 0.3, end: 0.4 },
        ])).toEqual([{ text: 'hi', start: 0, end: 0.3 }]);
    });

    it('gives zero-length words a visible floor', () => {
        const [only] = normalizeWords([{ text: 'a', start: 1, end: 1 }]);
        expect(only.end).toBeGreaterThan(only.start);
    });

    it('forces monotonic spans when a provider overlaps them', () => {
        const out = normalizeWords([
            { text: 'a', start: 0, end: 1.0 },
            { text: 'b', start: 0.5, end: 1.5 },
        ]);
        expect(out[1].start).toBeGreaterThanOrEqual(out[0].end);
    });

    it('clamps negative starts', () => {
        expect(normalizeWords([{ text: 'a', start: -2, end: 0.3 }])[0].start).toBe(0);
    });

    it('survives non-finite input', () => {
        const out = normalizeWords([{ text: 'a', start: NaN, end: Infinity }]);
        expect(Number.isFinite(out[0].start)).toBe(true);
        expect(out[0].end).toBeGreaterThan(out[0].start);
    });
});
