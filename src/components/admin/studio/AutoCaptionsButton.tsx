'use client';

/**
 * "Auto captions" — one button.
 *
 * Extracts the spoken audio, transcribes it to word timings, and lays
 * TikTok-style caption clips onto a text track with the spoken word
 * highlighted. Every result is editable afterwards (see CaptionEditor): the
 * transcript is never treated as final, because no engine is perfect on anime
 * audio with music and effects over dialogue.
 *
 * Audio is extracted and downmixed to 16kHz mono LOCALLY with the FFmpeg.wasm
 * Studio already loads for export, so a minute of speech uploads as ~100KB
 * instead of tens of megabytes of video.
 */

import { useState } from 'react';
import { Captions, Loader2 } from 'lucide-react';
import { useProjectStore } from './store/projectStore';
import { getFFmpeg } from './export/ffmpegClient';
import { getBlob } from './store/blobStore';
import { useMediaStore } from './store/mediaStore';
import { pickCaptionSource, captionsFromWords } from './autoCaptions';
import type { MediaAsset } from './types';

async function sourceBytes(asset: MediaAsset): Promise<Blob> {
    const key = asset.opfsKey || asset.id;
    const cached = await getBlob(key).catch(() => null);
    if (cached) return cached;
    const url = useMediaStore.getState().getUrl(asset.id) || asset.remoteUrl;
    if (!url) throw new Error(`No audio available for ${asset.name}`);
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error(`Could not read media (HTTP ${res.status})`);
    return res.blob();
}

/** Demux to 16kHz mono WAV in the browser. */
async function extractAudio(blob: Blob, filename: string): Promise<Blob> {
    const ffmpeg = await getFFmpeg();
    const inName = `cap_src_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const outName = 'cap_audio.wav';
    await ffmpeg.writeFile(inName, new Uint8Array(await blob.arrayBuffer()));
    try {
        await ffmpeg.exec(['-i', inName, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', outName]);
        const data = await ffmpeg.readFile(outName);
        // .slice() copies into a plain ArrayBuffer — ffmpeg.wasm can return a
        // SharedArrayBuffer-backed view, which is not a valid BlobPart.
        return new Blob([(data as Uint8Array).slice().buffer], { type: 'audio/wav' });
    } finally {
        await ffmpeg.deleteFile(inName).catch(() => {});
        await ffmpeg.deleteFile(outName).catch(() => {});
    }
}

export default function AutoCaptionsButton({ language }: { language?: string }) {
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function run() {
        const project = useProjectStore.getState().project;
        if (!project || busy) return;
        setError(null);

        const source = pickCaptionSource(project);
        if (!source) {
            setError('No clip with audio on the timeline yet.');
            return;
        }

        try {
            setBusy('Extracting audio');
            const raw = await sourceBytes(source.asset);
            const wav = await extractAudio(raw, source.asset.name || 'source');

            setBusy('Transcribing');
            const form = new FormData();
            form.append('file', wav, 'audio.wav');
            if (language) form.append('language', language);
            const res = await fetch('/api/admin/studio/transcribe', {
                method: 'POST',
                credentials: 'same-origin',
                body: form,
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) {
                throw new Error(json.error || `Transcription failed (HTTP ${res.status})`);
            }
            if (!json.words?.length) {
                setError('No speech found in this clip.');
                return;
            }

            setBusy('Building captions');
            const store = useProjectStore.getState();
            // Captions get their own track so they can be hidden or deleted
            // wholesale without disturbing hand-placed text.
            const trackId = store.addTrack('text', 'Captions');
            const clips = captionsFromWords(json.words, source.clip, trackId);
            for (const c of clips) {
                store.addClip(trackId, c);
            }
        } catch (e: any) {
            setError(e?.message || 'Captions failed');
        } finally {
            setBusy(null);
        }
    }

    return (
        <>
            <button
                className="ak-btn ak-btn--secondary ak-btn--sm"
                onClick={run}
                disabled={!!busy}
                title="Transcribe the audio and add TikTok-style captions"
            >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Captions size={13} />}
                {busy || 'Auto captions'}
            </button>
            {error && (
                <span className="ak-caption" style={{ color: 'var(--sun)', marginLeft: 8 }}>{error}</span>
            )}
        </>
    );
}
