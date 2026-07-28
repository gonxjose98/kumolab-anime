/**
 * /api/admin/studio/transcribe — audio in, word timings out.
 *
 *   POST multipart: file=<audio blob>, [language=en|ja], [provider]
 *     → { success, words: [{text,start,end}], language, text, provider, model }
 *
 * The browser extracts and downmixes the audio with the FFmpeg.wasm it already
 * ships (16kHz mono), so what arrives here is ~100KB for a minute of speech.
 * That keeps this function well inside Vercel's limits and well under the
 * provider's 25MB upload cap.
 *
 * Auth: middleware gates /api/admin/studio/* by Supabase session + the
 * 'studio' permission for sub-users.
 */

import { NextRequest, NextResponse } from 'next/server';
import { transcribe, TranscribeError, type TranscribeProvider } from '@/lib/studio/transcribe';

export const dynamic = 'force-dynamic';
// Whisper on a 60s clip is a few seconds; allow headroom for a cold start
// plus a longer clip without letting a hung request run for minutes.
export const maxDuration = 120;

/** Upper bound on what we accept. The browser sends ~100KB/min of 16kHz mono,
 *  so anything near this is a sign the client skipped the downmix. */
const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req: NextRequest) {
    try {
        const form = await req.formData().catch(() => null);
        if (!form) {
            return NextResponse.json({ success: false, error: 'Expected multipart form data' }, { status: 400 });
        }

        const file = form.get('file');
        if (!(file instanceof Blob) || file.size === 0) {
            return NextResponse.json({ success: false, error: 'file is required' }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
            return NextResponse.json(
                { success: false, error: 'Audio too large. Extract 16kHz mono before uploading.' },
                { status: 413 },
            );
        }

        const languageRaw = form.get('language');
        const language = typeof languageRaw === 'string' && /^[a-z]{2}$/i.test(languageRaw)
            ? languageRaw.toLowerCase()
            : undefined;

        const providerRaw = form.get('provider');
        const provider = typeof providerRaw === 'string' && providerRaw
            ? (providerRaw as TranscribeProvider)
            : undefined;

        const filename = (file as File).name || 'audio.wav';
        const result = await transcribe(file, filename, { provider, language });

        return NextResponse.json({ success: true, ...result });
    } catch (e: any) {
        if (e instanceof TranscribeError) {
            return NextResponse.json({ success: false, error: e.message }, { status: e.status });
        }
        console.error('[studio/transcribe] error', e);
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
