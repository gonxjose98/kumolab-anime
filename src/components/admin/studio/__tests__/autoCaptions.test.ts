import { describe, it, expect } from 'vitest';
import { mapWordsToTimeline, buildCaptionClips, captionsFromWords, retimeWords, pickCaptionSource } from '@/components/admin/studio/autoCaptions';
import type { Clip, VideoProject } from '@/components/admin/studio/types';

// Source-time → timeline-time mapping is where caption sync silently breaks:
// a trimmed or sped-up clip shifts every word. These pin the arithmetic.

const clip = (over: Partial<Clip> = {}): Clip => ({
    id: 'c1', trackId: 't1',
    srcStart: 0, srcEnd: 10,
    timelineStart: 0, duration: 10,
    speed: 1, volume: 1, muted: false, z: 1,
    ...over,
} as Clip);

const w = (text: string, start: number, end: number) => ({ text, start, end });

const project = (over: Partial<VideoProject> = {}): VideoProject => ({
    schemaVersion: 1, postId: 'p', meta: {} as any, durationSec: 10, updatedAt: 0,
    media: [], tracks: [], ...over,
} as VideoProject);

describe('pickCaptionSource', () => {
    it('does NOT trust hasAudio:false — probeMedia is unreliable in Chrome', () => {
        // Regression: a real MP4 with an AAC track probed as hasAudio:false,
        // and excluding on that reported "No clip with audio" on good footage.
        const p = project({
            media: [{ id: 'm1', kind: 'video', name: 'v.mp4', origin: 'opfs', durationSec: 4, createdAt: 0, hasAudio: false } as any],
            tracks: [{ id: 't1', kind: 'video', name: 'V', order: 0, muted: false, hidden: false, locked: false,
                clips: [{ id: 'c1', trackId: 't1', mediaId: 'm1', srcStart: 0, srcEnd: 4, timelineStart: 0, duration: 4, speed: 1, volume: 1, muted: false, z: 1 }] } as any],
        });
        expect(pickCaptionSource(p)?.clip.id).toBe('c1');
    });

    it('prefers a clip known to have audio', () => {
        const p = project({
            media: [
                { id: 'm1', kind: 'video', name: 'v.mp4', origin: 'opfs', durationSec: 4, createdAt: 0, hasAudio: false } as any,
                { id: 'm2', kind: 'audio', name: 'vo.mp3', origin: 'opfs', durationSec: 4, createdAt: 0, hasAudio: true } as any,
            ],
            tracks: [
                { id: 't1', kind: 'video', name: 'V', order: 0, muted: false, hidden: false, locked: false,
                    clips: [{ id: 'c1', trackId: 't1', mediaId: 'm1', srcStart: 0, srcEnd: 4, timelineStart: 0, duration: 4, speed: 1, volume: 1, muted: false, z: 1 }] } as any,
                { id: 't2', kind: 'audio', name: 'A', order: 1, muted: false, hidden: false, locked: false,
                    clips: [{ id: 'c2', trackId: 't2', mediaId: 'm2', srcStart: 0, srcEnd: 4, timelineStart: 0, duration: 4, speed: 1, volume: 1, muted: false, z: 1 }] } as any,
            ],
        });
        expect(pickCaptionSource(p)?.clip.id).toBe('c2');
    });

    it('ignores hidden and muted tracks', () => {
        const p = project({
            media: [{ id: 'm1', kind: 'video', name: 'v.mp4', origin: 'opfs', durationSec: 4, createdAt: 0 } as any],
            tracks: [{ id: 't1', kind: 'video', name: 'V', order: 0, muted: false, hidden: true, locked: false,
                clips: [{ id: 'c1', trackId: 't1', mediaId: 'm1', srcStart: 0, srcEnd: 4, timelineStart: 0, duration: 4, speed: 1, volume: 1, muted: false, z: 1 }] } as any],
        });
        expect(pickCaptionSource(p)).toBeNull();
    });

    it('returns null for an empty timeline', () => {
        expect(pickCaptionSource(project())).toBeNull();
    });
});

describe('mapWordsToTimeline', () => {
    it('is identity for an untrimmed clip at the start of the timeline', () => {
        expect(mapWordsToTimeline([w('a', 1, 1.5)], clip())).toEqual([{ text: 'a', start: 1, end: 1.5 }]);
    });

    it('shifts by timelineStart', () => {
        const [only] = mapWordsToTimeline([w('a', 1, 1.5)], clip({ timelineStart: 4 }));
        expect(only.start).toBeCloseTo(5);
        expect(only.end).toBeCloseTo(5.5);
    });

    it('subtracts srcStart when the clip head is trimmed', () => {
        // Word at 3s of source, clip starts at 2s of source and sits at 0 on
        // the timeline, so it should land at 1s.
        const [only] = mapWordsToTimeline([w('a', 3, 3.4)], clip({ srcStart: 2 }));
        expect(only.start).toBeCloseTo(1);
        expect(only.end).toBeCloseTo(1.4);
    });

    it('compresses by speed', () => {
        const [only] = mapWordsToTimeline([w('a', 2, 3)], clip({ speed: 2 }));
        expect(only.start).toBeCloseTo(1);
        expect(only.end).toBeCloseTo(1.5);
    });

    it('drops words entirely outside the trim', () => {
        const out = mapWordsToTimeline([
            w('before', 0, 0.5),
            w('inside', 5, 5.5),
            w('after', 9, 9.5),
        ], clip({ srcStart: 2, srcEnd: 8 }));
        expect(out.map((x) => x.text)).toEqual(['inside']);
    });

    it('clamps a word straddling the trim edge instead of dropping it', () => {
        const out = mapWordsToTimeline([w('edge', 1.5, 2.5)], clip({ srcStart: 2, srcEnd: 8 }));
        expect(out).toHaveLength(1);
        expect(out[0].start).toBeCloseTo(0);
    });

    it('combines trim, offset and speed', () => {
        // source 6s → (6-2)/2 = 2s into the clip → 10 + 2 = 12s on the timeline
        const [only] = mapWordsToTimeline([w('a', 6, 7)], clip({ srcStart: 2, srcEnd: 8, timelineStart: 10, speed: 2 }));
        expect(only.start).toBeCloseTo(12);
    });
});

describe('buildCaptionClips', () => {
    const lines = [
        { words: [w('hello', 1.0, 1.4), w('there', 1.4, 1.8)], start: 1.0, end: 1.8, text: 'hello there' },
    ];

    it('places the clip over the line span', () => {
        const [c] = buildCaptionClips(lines, 'track-1');
        expect(c.timelineStart).toBeCloseTo(1.0);
        expect(c.duration).toBeCloseTo(0.8);
        expect(c.trackId).toBe('track-1');
    });

    it('stores word timings RELATIVE to the clip', () => {
        // Absolute times would desync the moment the clip is dragged.
        const [c] = buildCaptionClips(lines, 'track-1');
        expect(c.text?.words?.[0].start).toBeCloseTo(0);
        expect(c.text?.words?.[1].start).toBeCloseTo(0.4);
    });

    it('carries the caption look and a highlight colour', () => {
        const [c] = buildCaptionClips(lines, 't');
        expect(c.text?.text).toBe('hello there');
        expect(c.text?.highlightColor).toBeTruthy();
        expect(c.text?.strokePx).toBeGreaterThan(0);
    });

    it('lets a caller override the style', () => {
        const [c] = buildCaptionClips(lines, 't', { highlightColor: '#ff0000', sizePct: 0.09 });
        expect(c.text?.highlightColor).toBe('#ff0000');
        expect(c.text?.sizePct).toBeCloseTo(0.09);
    });

    it('gives every clip a distinct id', () => {
        const many = buildCaptionClips([lines[0], { ...lines[0] }], 't');
        expect(many[0].id).not.toBe(many[1].id);
    });
});

describe('retimeWords — editing a caption must not desync it', () => {
    const words = [w('helo', 0, 0.4), w('there', 0.4, 1.0)];

    it('keeps every timing when only a typo is fixed', () => {
        // The overwhelmingly common edit. Timings must survive exactly.
        const out = retimeWords(words, 'hello there')!;
        expect(out.map((x) => x.text)).toEqual(['hello', 'there']);
        expect(out[0].start).toBeCloseTo(0);
        expect(out[0].end).toBeCloseTo(0.4);
        expect(out[1].end).toBeCloseTo(1.0);
    });

    it('redistributes across the same span when a word is added', () => {
        const out = retimeWords(words, 'well hello there')!;
        expect(out).toHaveLength(3);
        expect(out[0].start).toBeCloseTo(0);
        expect(out[2].end).toBeCloseTo(1.0);
    });

    it('redistributes when a word is removed', () => {
        const out = retimeWords(words, 'there')!;
        expect(out).toHaveLength(1);
        expect(out[0].start).toBeCloseTo(0);
        expect(out[0].end).toBeCloseTo(1.0);
    });

    it('keeps words in order and non-overlapping after redistribution', () => {
        const out = retimeWords(words, 'a bb ccc dddd')!;
        for (let i = 1; i < out.length; i++) {
            expect(out[i].start).toBeGreaterThanOrEqual(out[i - 1].end - 1e-9);
            expect(out[i].end).toBeGreaterThan(out[i].start);
        }
    });

    it('gives longer words more time', () => {
        const out = retimeWords(words, 'a wonderfully')!;
        const first = out[0].end - out[0].start;
        const second = out[1].end - out[1].start;
        expect(second).toBeGreaterThan(first);
    });

    it('returns undefined when the text is cleared', () => {
        expect(retimeWords(words, '   ')).toBeUndefined();
    });

    it('returns undefined for a clip that had no timings (plain text)', () => {
        expect(retimeWords(undefined, 'hello')).toBeUndefined();
    });
});

describe('captionsFromWords', () => {
    it('maps, groups and builds in one pass', () => {
        const words = Array.from({ length: 8 }, (_, i) => w(`w${i}`, i * 0.4, i * 0.4 + 0.35));
        const clips = captionsFromWords(words, clip({ timelineStart: 2 }), 'tt', { group: { maxWords: 4 } });
        expect(clips.length).toBeGreaterThan(1);
        // Everything shifted by the clip's placement.
        expect(clips[0].timelineStart).toBeGreaterThanOrEqual(2);
        // And each clip's own words start at ~0.
        expect(clips[0].text?.words?.[0].start).toBeCloseTo(0);
    });

    it('returns nothing when the transcript is empty', () => {
        expect(captionsFromWords([], clip(), 'tt')).toEqual([]);
    });
});
