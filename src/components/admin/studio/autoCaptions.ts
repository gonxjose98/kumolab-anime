import type { Clip, MediaAsset, TextStyle, VideoProject } from './types';
import { uid, DEFAULT_TEXT } from './types';
import type { TranscriptWord } from '@/lib/studio/transcribe';
import { groupIntoLines, type CaptionLine, type GroupOptions } from '@/lib/studio/captionLines';

/**
 * Turning a transcript into caption clips on the timeline.
 *
 * Kept pure and separate from the button so the fiddly part — mapping source
 * audio time onto timeline time through a trimmed, speed-adjusted clip — is
 * unit-testable. Getting that wrong puts captions slightly out of sync, which
 * is exactly the sort of bug that is obvious to a viewer and invisible in code
 * review.
 */

/** TikTok-ish defaults: big, bold, high contrast, sat in the lower third. */
export const CAPTION_STYLE: Partial<TextStyle> = {
    sizePct: 0.055,
    weight: 900,
    color: '#ffffff',
    align: 'center',
    strokePx: 3,
    strokeColor: 'rgba(0,0,0,0.9)',
    highlightColor: '#ffd76e',
    highlightBg: null,
};

export const CAPTION_Y_PCT = 0.78;

export interface CaptionSource {
    clip: Clip;
    asset: MediaAsset;
}

/**
 * Which clip's audio to transcribe.
 *
 * Prefers an audio-track clip (a voiceover is the thing you most want
 * captioned), then the first video clip.
 *
 * `asset.hasAudio` is used to RANK, never to exclude. It comes from
 * probeMedia, which is explicitly best-effort: Chrome exposes no reliable
 * track info, so a normal MP4 with an AAC track routinely probes as
 * `hasAudio: false` (observed 2026-07-28 on a file that definitely had one).
 * Trusting it meant "No clip with audio on the timeline yet" on perfectly
 * good footage. If a clip genuinely has no audio, extraction says so.
 */
export function pickCaptionSource(project: VideoProject): CaptionSource | null {
    const mediaById = new Map(project.media.map((m) => [m.id, m]));
    const candidates: CaptionSource[] = [];

    for (const kind of ['audio', 'video'] as const) {
        const tracks = project.tracks
            .filter((t) => t.kind === kind && !t.hidden && !t.muted)
            .sort((a, b) => a.order - b.order);
        for (const t of tracks) {
            const clips = t.clips.slice().sort((a, b) => a.timelineStart - b.timelineStart);
            for (const c of clips) {
                if (!c.mediaId) continue;
                const asset = mediaById.get(c.mediaId);
                if (asset) candidates.push({ clip: c, asset });
            }
        }
    }
    if (!candidates.length) return null;

    // Known-audio first, otherwise first in track order.
    return candidates.find((c) => c.asset.hasAudio === true) ?? candidates[0];
}

/**
 * Map word times from SOURCE media seconds onto TIMELINE seconds for `clip`,
 * dropping anything outside the trimmed region.
 *
 * timeline = clip.timelineStart + (sourceTime - clip.srcStart) / speed
 */
export function mapWordsToTimeline(words: TranscriptWord[], clip: Clip): TranscriptWord[] {
    const speed = clip.speed || 1;
    const out: TranscriptWord[] = [];
    for (const w of words) {
        // Keep a word that overlaps the trim at all, clamped to its edges.
        if (w.end <= clip.srcStart || w.start >= clip.srcEnd) continue;
        const s = Math.max(w.start, clip.srcStart);
        const e = Math.min(w.end, clip.srcEnd);
        const start = clip.timelineStart + (s - clip.srcStart) / speed;
        const end = clip.timelineStart + (e - clip.srcStart) / speed;
        if (end <= start) continue;
        out.push({ text: w.text, start, end });
    }
    return out;
}

/** Build one caption clip per line, with word timings relative to the clip. */
export function buildCaptionClips(
    lines: CaptionLine[],
    trackId: string,
    style: Partial<TextStyle> = {},
): Clip[] {
    return lines.map((line) => {
        const duration = Math.max(0.2, line.end - line.start);
        const text: TextStyle = {
            ...DEFAULT_TEXT,
            ...CAPTION_STYLE,
            ...style,
            text: line.text,
            // Relative to the clip so trimming or dragging the clip keeps the
            // karaoke in sync with the words on screen.
            words: line.words.map((w) => ({
                text: w.text,
                start: Math.max(0, w.start - line.start),
                end: Math.max(0.05, w.end - line.start),
            })),
        };
        return {
            id: uid(),
            trackId,
            srcStart: 0,
            srcEnd: duration,
            timelineStart: line.start,
            duration,
            speed: 1,
            volume: 1,
            muted: false,
            transform: { xPct: 0.5, yPct: CAPTION_Y_PCT, scale: 1, rotationDeg: 0, opacity: 1, fit: 'contain', fillStyle: undefined },
            text,
            z: 12,
        } as Clip;
    });
}

/**
 * Keep karaoke timings usable after the operator edits a caption's text.
 *
 * Fixing a misheard word is the single most common edit, so losing sync on
 * every keystroke would make the feature useless. Two cases:
 *   • same word count  → keep every timing, just swap the words. A typo fix
 *                        (the overwhelming case) stays perfectly in sync.
 *   • count changed    → redistribute the line's existing span across the new
 *                        words, weighted by length so longer words hold longer.
 *                        Approximate, but the line still starts and ends on the
 *                        right beats, which is what the eye actually tracks.
 */
export function retimeWords(
    existing: { text: string; start: number; end: number }[] | undefined,
    newText: string,
): { text: string; start: number; end: number }[] | undefined {
    const words = newText.split(' ').filter((w) => w.length > 0);
    if (!words.length) return undefined;
    if (!existing?.length) return undefined;

    if (words.length === existing.length) {
        return existing.map((w, i) => ({ ...w, text: words[i] }));
    }

    const start = existing[0].start;
    const end = Math.max(start + 0.1, existing[existing.length - 1].end);
    const span = end - start;
    const weights = words.map((w) => Math.max(1, w.length));
    const total = weights.reduce((a, b) => a + b, 0);

    let cursor = start;
    return words.map((text, i) => {
        const dur = (weights[i] / total) * span;
        const wStart = cursor;
        cursor = i === words.length - 1 ? end : cursor + dur;
        return { text, start: wStart, end: Math.max(wStart + 0.05, cursor) };
    });
}

/** Transcript words → finished caption clips, in one call. */
export function captionsFromWords(
    words: TranscriptWord[],
    clip: Clip,
    trackId: string,
    opts: { group?: GroupOptions; style?: Partial<TextStyle> } = {},
): Clip[] {
    const mapped = mapWordsToTimeline(words, clip);
    const lines = groupIntoLines(mapped, opts.group);
    return buildCaptionClips(lines, trackId, opts.style);
}
