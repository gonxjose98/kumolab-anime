/**
 * Kokoro text-to-speech, running entirely in the browser.
 *
 * Apache-2.0, 82M params, no API key and no per-use cost. The model is fetched
 * from the Hugging Face CDN on first use and then cached by the browser, so the
 * download is a one-time cost per device rather than per generation.
 *
 * ENGLISH ONLY, deliberately. Kokoro ships Japanese voices, but Japanese
 * requires the misaki → cutlet → fugashi → unidic phonemiser chain, which is
 * Python-only and ships a ~1GB dictionary. There is no browser path for it, so
 * offering JA voices here would produce silence or garbage. Use a paid provider
 * if Japanese narration is ever needed.
 *
 * Kokoro also has NO emotion or style controls — the levers are voice choice
 * and speed. Anything richer (emotion tags, direction) is an ElevenLabs
 * feature and would mean a paid API.
 *
 * Everything is dynamically imported so neither the model nor the ~MBs of
 * transformers.js runtime touch the main Studio bundle.
 */

export interface VoiceOption {
    id: string;
    label: string;
    gender?: string;
    /** Kokoro's own quality grade, A (best) through D. */
    grade?: string;
}

/** Loaded lazily and reused — re-instantiating would refetch the weights. */
let ttsPromise: Promise<any> | null = null;

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

/**
 * WebGPU wants fp32 (per the library's own guidance); the wasm fallback uses
 * the q8 build, which is a far smaller download and fast enough on CPU for the
 * short scripts this is meant for.
 */
function backend(): { device: 'webgpu' | 'wasm'; dtype: 'fp32' | 'q8' } {
    const hasGpu = typeof navigator !== 'undefined' && !!(navigator as any).gpu;
    return hasGpu ? { device: 'webgpu', dtype: 'fp32' } : { device: 'wasm', dtype: 'q8' };
}

export async function getTTS(): Promise<any> {
    if (ttsPromise) return ttsPromise;
    ttsPromise = (async () => {
        const { KokoroTTS } = await import('kokoro-js');
        const { device, dtype } = backend();
        return KokoroTTS.from_pretrained(MODEL_ID, { dtype, device });
    })();
    try {
        return await ttsPromise;
    } catch (e) {
        // Let a later attempt retry rather than caching the failure forever.
        ttsPromise = null;
        throw e;
    }
}

/**
 * Voices the model ships, best-graded first.
 *
 * NOTE: `tts.list_voices()` is a console.table debug helper — it PRINTS and
 * returns undefined. The actual map is `tts.voices`. Reading the return value
 * yields an empty list and a permanently disabled UI.
 *
 * Each entry looks like:
 *   af_heart → { name, language: 'en-us', gender, traits, overallGrade: 'A' }
 * The v1.0 ONNX build ships 28 voices and all are en-us/en-gb, which matches
 * the phonemiser constraint above: there is no Japanese to expose.
 */
export async function listVoices(): Promise<VoiceOption[]> {
    const tts = await getTTS();
    const raw = (tts.voices ?? {}) as Record<string, any>;
    const out: VoiceOption[] = [];

    for (const [id, meta] of Object.entries(raw)) {
        const lang = String(meta?.language || '');
        if (!lang.startsWith('en')) continue;
        const name = meta?.name || id.split('_')[1] || id;
        const accent = lang === 'en-gb' ? 'UK' : 'US';
        const gender = meta?.gender || (id[1] === 'f' ? 'Female' : 'Male');
        const grade = meta?.overallGrade || meta?.targetQuality || '';
        out.push({
            id,
            label: `${name} · ${accent} ${gender}${grade ? ` · ${grade}` : ''}`,
            gender,
            grade,
        });
    }

    // Best-sounding first — the grades vary a lot (A down to D-), and the
    // default pick should be one of the good ones.
    return out.sort((a, b) => (a.grade || 'Z').localeCompare(b.grade || 'Z') || a.label.localeCompare(b.label));
}

export interface GeneratedVoice {
    blob: Blob;
    durationSec: number;
}

/** Generate speech as a WAV blob. */
export async function generateVoice(text: string, voice: string): Promise<GeneratedVoice> {
    const clean = text.trim();
    if (!clean) throw new Error('Nothing to say — write a script first.');

    const tts = await getTTS();
    const audio = await tts.generate(clean, { voice });

    // transformers.js RawAudio: toBlob() in newer builds, toWav() (ArrayBuffer)
    // otherwise. Support both so a minor bump doesn't break generation.
    let blob: Blob;
    if (typeof audio.toBlob === 'function') {
        blob = audio.toBlob();
    } else if (typeof audio.toWav === 'function') {
        blob = new Blob([audio.toWav()], { type: 'audio/wav' });
    } else {
        throw new Error('Unexpected audio format from the speech model');
    }

    const samples = audio.audio?.length ?? 0;
    const rate = audio.sampling_rate || 24000;
    return { blob, durationSec: samples ? samples / rate : 0 };
}
