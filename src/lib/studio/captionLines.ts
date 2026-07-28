import type { TranscriptWord } from './transcribe';

/**
 * Grouping raw word timings into TikTok-style caption lines.
 *
 * The look being copied shows a SHORT burst on screen (a few words), with the
 * word currently being spoken highlighted, then cuts to the next burst. Long
 * lines read as film subtitles instead, which is the wrong feel, so the
 * defaults here are deliberately tight.
 *
 * Pure and dependency-free so it is unit-testable and can be re-run cheaply
 * whenever the operator changes the words-per-line setting: regrouping never
 * needs another transcription.
 */

export interface CaptionLine {
    words: TranscriptWord[];
    start: number;
    end: number;
    text: string;
}

export interface GroupOptions {
    /** Hard ceiling on words per line. */
    maxWords?: number;
    /** Hard ceiling on characters, so long words don't overflow the frame. */
    maxChars?: number;
    /** A silence longer than this starts a new line, so captions follow speech. */
    gapSec?: number;
    /** A line never lingers longer than this. */
    maxDurationSec?: number;
}

export const DEFAULT_GROUP: Required<GroupOptions> = {
    maxWords: 4,
    maxChars: 28,
    gapSec: 0.6,
    maxDurationSec: 3,
};

/** True when `w` should begin a new line rather than extend `current`. */
function shouldBreak(current: TranscriptWord[], w: TranscriptWord, o: Required<GroupOptions>): boolean {
    if (current.length === 0) return false;
    if (current.length >= o.maxWords) return true;

    const prev = current[current.length - 1];
    if (w.start - prev.end >= o.gapSec) return true;

    const chars = current.reduce((n, x) => n + x.text.length, 0) + current.length + w.text.length;
    if (chars > o.maxChars) return true;

    if (w.end - current[0].start > o.maxDurationSec) return true;

    // Sentence-final punctuation is a natural beat; breaking here keeps a
    // caption from straddling two thoughts.
    if (/[.!?。！？]$/.test(prev.text)) return true;

    return false;
}

export function groupIntoLines(words: TranscriptWord[], opts: GroupOptions = {}): CaptionLine[] {
    const o = { ...DEFAULT_GROUP, ...opts };
    const lines: CaptionLine[] = [];
    let current: TranscriptWord[] = [];

    const flush = () => {
        if (!current.length) return;
        lines.push({
            words: current,
            start: current[0].start,
            end: current[current.length - 1].end,
            text: current.map((w) => w.text).join(' '),
        });
        current = [];
    };

    for (const w of words) {
        if (shouldBreak(current, w, o)) flush();
        current.push(w);
    }
    flush();

    return lines;
}

/**
 * Index of the word being spoken at `t` (seconds, relative to the line's own
 * start), or -1 when between words.
 *
 * Deliberately does NOT hold the highlight through gaps: on a pause the
 * highlight clears, which reads as the speaker pausing rather than as a stuck
 * caption.
 */
export function activeWordIndex(words: TranscriptWord[], t: number): number {
    for (let i = 0; i < words.length; i++) {
        if (t >= words[i].start && t < words[i].end) return i;
    }
    return -1;
}
