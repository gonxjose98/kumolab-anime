'use client';

/**
 * Voiceover — type a script, pick a voice, get an audio clip on the timeline.
 *
 * Runs Kokoro locally in the browser: free, no API key, nothing leaves the
 * device. The model downloads once on first use (the UI says so, because that
 * first wait is otherwise baffling) and is cached by the browser afterwards.
 *
 * The generated clip lands on an audio track, which the exporter MIXES with the
 * video's own audio rather than replacing it, so narration sits over the
 * original sound.
 */

import { useState } from 'react';
import { Mic, Loader2 } from 'lucide-react';
import { useProjectStore } from './store/projectStore';
import { usePlaybackStore } from './store/playbackStore';
import { useMediaStore } from './store/mediaStore';
import { addAssetToTimeline } from './clipFactory';
import { uid, type MediaAsset } from './types';
import { listVoices, generateVoice, type VoiceOption } from './voiceover';

export default function VoiceoverPanel() {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const [voices, setVoices] = useState<VoiceOption[]>([]);
    const [voice, setVoice] = useState('af_heart');
    const [status, setStatus] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loadedVoices, setLoadedVoices] = useState(false);

    async function openPanel() {
        setOpen((o) => !o);
        if (loadedVoices || voices.length) return;
        // Loading the voice list warms the model, so do it only once the
        // operator has actually opened the panel.
        setStatus('Loading voices (first time downloads the model)');
        setError(null);
        try {
            const list = await listVoices();
            setVoices(list);
            setLoadedVoices(true);
            if (list.length && !list.some((v) => v.id === voice)) setVoice(list[0].id);
        } catch (e: any) {
            setError(e?.message || 'Could not load the speech model');
        } finally {
            setStatus(null);
        }
    }

    async function generate() {
        if (!text.trim() || status) return;
        setError(null);
        setStatus('Generating speech');
        try {
            const { blob, durationSec } = await generateVoice(text, voice);

            const id = uid();
            await useMediaStore.getState().register(id, blob, id);
            const asset: MediaAsset = {
                id,
                kind: 'audio',
                name: `Voiceover — ${text.trim().slice(0, 28)}${text.trim().length > 28 ? '…' : ''}`,
                origin: 'opfs',
                opfsKey: id,
                durationSec,
                hasAudio: true,
                createdAt: Date.now(),
            };
            useProjectStore.getState().addMedia(asset);
            addAssetToTimeline(asset);
            // Park the playhead at the start so it can be auditioned immediately.
            usePlaybackStore.getState().setCurrentTime(0);
            setText('');
        } catch (e: any) {
            setError(e?.message || 'Speech generation failed');
        } finally {
            setStatus(null);
        }
    }

    return (
        <div style={{ marginBottom: 12 }}>
            <button
                className="ak-btn ak-btn--ghost ak-btn--sm ak-btn--block"
                onClick={openPanel}
                title="Generate a voiceover locally — free, no account"
            >
                <Mic size={13} /> Voiceover
            </button>

            {open && (
                <div style={{ marginTop: 8, padding: 10, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--line-2)' }}>
                    <textarea
                        className="ak-field__input"
                        style={{ height: 'auto', padding: 8, resize: 'vertical', width: '100%' }}
                        rows={3}
                        placeholder="What should the voice say?"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        disabled={!!status}
                    />

                    <select
                        className="ak-field__input"
                        style={{ marginTop: 8, width: '100%' }}
                        value={voice}
                        onChange={(e) => setVoice(e.target.value)}
                        disabled={!!status || !voices.length}
                    >
                        {voices.length === 0 && <option>Loading voices…</option>}
                        {voices.map((v) => (
                            <option key={v.id} value={v.id}>{v.label}</option>
                        ))}
                    </select>

                    <button
                        className="ak-btn ak-btn--primary ak-btn--sm ak-btn--block"
                        style={{ marginTop: 8 }}
                        onClick={generate}
                        disabled={!text.trim() || !!status || !voices.length}
                    >
                        {status ? <Loader2 size={13} className="animate-spin" /> : <Mic size={13} />}
                        {status || 'Generate voiceover'}
                    </button>

                    {error && <div className="ak-caption" style={{ color: 'var(--sun)', marginTop: 6 }}>{error}</div>}
                    <span className="st-hint" style={{ display: 'block', marginTop: 6 }}>
                        Runs on your device. English voices only, and no emotion controls — pick the voice that fits.
                    </span>
                </div>
            )}
        </div>
    );
}
