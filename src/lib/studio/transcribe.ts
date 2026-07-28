/**
 * Speech → word-level timings, for karaoke-style captions.
 *
 * Provider-agnostic on purpose. The caption renderer only ever sees
 * `TranscriptWord[]`, so swapping engines is a change to this file alone.
 *
 * Current default: OpenAI `whisper-1`. Chosen because the key is already
 * configured and it is the only OpenAI model that returns word timings
 * (`gpt-4o-transcribe` does not, and the /translations endpoint has no
 * timestamps at all). Verified working 2026-07-28.
 *
 * Known risk: whisper-1 has appeared on retirement lists. If it goes, or if
 * Japanese quality disappoints on real anime audio, switch DEFAULT_PROVIDER to
 * 'deepgram' (Nova-3, strongest JA claim, $200 free credit) and set
 * DEEPGRAM_API_KEY. Nothing outside this module changes.
 *
 * Groq is deliberately NOT the default despite being ~9x cheaper: the
 * configured key returns `organization_restricted` on every endpoint
 * (checked 2026-07-28). The adapter is kept so it can be re-enabled if the
 * account is restored.
 */

export interface TranscriptWord {
    /** The word as spoken. For Japanese this is a subword/kana chunk, which
     *  is what we want: it pops at a natural rhythm. */
    text: string;
    /** Seconds from the start of the submitted audio. */
    start: number;
    end: number;
}

export interface TranscriptResult {
    words: TranscriptWord[];
    /** Detected (or forced) language, when the provider reports one. */
    language: string | null;
    /** Full text, handy for a quick sanity read in the editor. */
    text: string;
    provider: string;
    model: string;
}

export type TranscribeProvider = 'openai' | 'deepgram' | 'groq';

export const DEFAULT_PROVIDER: TranscribeProvider = 'openai';

export class TranscribeError extends Error {
    constructor(message: string, readonly status: number = 500) {
        super(message);
        this.name = 'TranscribeError';
    }
}

/** Drop empties and enforce monotonic, non-negative, non-inverted spans. */
export function normalizeWords(raw: TranscriptWord[]): TranscriptWord[] {
    const out: TranscriptWord[] = [];
    for (const w of raw) {
        const text = (w.text ?? '').trim();
        if (!text) continue;
        let start = Number.isFinite(w.start) ? Math.max(0, w.start) : 0;
        let end = Number.isFinite(w.end) ? w.end : start;
        // A provider occasionally emits end <= start on very short tokens;
        // give them a floor so the highlight is visible rather than skipped.
        if (end <= start) end = start + 0.08;
        const prev = out[out.length - 1];
        if (prev && start < prev.end) start = prev.end;
        if (end <= start) end = start + 0.08;
        out.push({ text, start, end });
    }
    return out;
}

// ── Providers ──────────────────────────────────────────────────────────

async function transcribeOpenAI(audio: Blob, filename: string, language?: string): Promise<TranscriptResult> {
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
        // Names the environment, because the usual cause is a key that exists
        // in .env.local but was never added to the deployment.
        throw new TranscribeError(
            'Transcription is not configured on the server. Add OPENAI_API_KEY in Vercel → Settings → Environment Variables, then redeploy.',
            500,
        );
    }

    const form = new FormData();
    form.append('file', audio, filename);
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    if (language) form.append('language', language);

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new TranscribeError(json?.error?.message || `Transcription failed (HTTP ${res.status})`, res.status);
    }

    return {
        words: normalizeWords((json.words || []).map((w: any) => ({ text: w.word, start: w.start, end: w.end }))),
        language: json.language ?? null,
        text: json.text ?? '',
        provider: 'openai',
        model: 'whisper-1',
    };
}

async function transcribeGroq(audio: Blob, filename: string, language?: string): Promise<TranscriptResult> {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new TranscribeError('GROQ_API_KEY is not configured', 500);

    const form = new FormData();
    form.append('file', audio, filename);
    form.append('model', 'whisper-large-v3');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    if (language) form.append('language', language);

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new TranscribeError(json?.error?.message || `Transcription failed (HTTP ${res.status})`, res.status);
    }

    return {
        words: normalizeWords((json.words || []).map((w: any) => ({ text: w.word, start: w.start, end: w.end }))),
        language: json.language ?? null,
        text: json.text ?? '',
        provider: 'groq',
        model: 'whisper-large-v3',
    };
}

async function transcribeDeepgram(audio: Blob, _filename: string, language?: string): Promise<TranscriptResult> {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) throw new TranscribeError('DEEPGRAM_API_KEY is not configured', 500);

    const params = new URLSearchParams({ model: 'nova-3', smart_format: 'true', punctuate: 'true' });
    if (language) params.set('language', language);

    const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
        method: 'POST',
        headers: { Authorization: `Token ${key}`, 'Content-Type': audio.type || 'audio/wav' },
        body: audio,
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new TranscribeError(json?.err_msg || json?.error || `Transcription failed (HTTP ${res.status})`, res.status);
    }

    const alt = json?.results?.channels?.[0]?.alternatives?.[0];
    return {
        words: normalizeWords((alt?.words || []).map((w: any) => ({
            text: w.punctuated_word || w.word,
            start: w.start,
            end: w.end,
        }))),
        language: json?.results?.channels?.[0]?.detected_language ?? language ?? null,
        text: alt?.transcript ?? '',
        provider: 'deepgram',
        model: 'nova-3',
    };
}

/**
 * Transcribe an audio blob to word timings.
 * `language` is an ISO code ('en', 'ja'); omit to let the provider detect.
 */
export function transcribe(
    audio: Blob,
    filename: string,
    opts: { provider?: TranscribeProvider; language?: string } = {},
): Promise<TranscriptResult> {
    const provider = opts.provider || DEFAULT_PROVIDER;
    switch (provider) {
        case 'deepgram': return transcribeDeepgram(audio, filename, opts.language);
        case 'groq': return transcribeGroq(audio, filename, opts.language);
        case 'openai': return transcribeOpenAI(audio, filename, opts.language);
        default: throw new TranscribeError(`Unknown provider: ${provider}`, 400);
    }
}
