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
 *
 * Presented as a MODAL rather than an inline panel so it can live in the
 * always-visible timeline bar. Anything parked in the Media panel body is
 * invisible on a phone, where that panel is collapsed by default.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic, Loader2, X } from 'lucide-react';
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

    // Load voices when the modal first opens — this also warms the model, so
    // it must not happen on mount for every Studio visit.
    useEffect(() => {
        if (!open || voices.length) return;
        let cancelled = false;
        setStatus('Loading voices (first run downloads the model)');
        setError(null);
        listVoices()
            .then((list) => {
                if (cancelled) return;
                setVoices(list);
                if (list.length && !list.some((v) => v.id === voice)) setVoice(list[0].id);
            })
            .catch((e) => { if (!cancelled) setError(e?.message || 'Could not load the speech model'); })
            .finally(() => { if (!cancelled) setStatus(null); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !status) setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, status]);

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
                name: `Voiceover: ${text.trim().slice(0, 28)}${text.trim().length > 28 ? '…' : ''}`,
                origin: 'opfs',
                opfsKey: id,
                durationSec,
                hasAudio: true,
                createdAt: Date.now(),
            };
            useProjectStore.getState().addMedia(asset);
            addAssetToTimeline(asset);
            usePlaybackStore.getState().setCurrentTime(0);
            setText('');
            setOpen(false);
        } catch (e: any) {
            setError(e?.message || 'Speech generation failed');
        } finally {
            setStatus(null);
        }
    }

    const busy = !!status;

    return (
        <>
            <button
                className="ak-btn ak-btn--secondary ak-btn--sm"
                onClick={() => setOpen(true)}
                title="Generate a voiceover on your device, free"
            >
                <Mic size={13} /> Voiceover
            </button>

            {/* `st-theme` carries the editor's dark palette to the portal, which
                renders outside .st-root and would otherwise inherit the light
                admin theme and show up white inside the dark editor. */}
            {open && typeof document !== 'undefined' && createPortal(
                <div className="admin-root st-theme">
                    <div
                        className="ak-modal__scrim ak-modal__scrim--safe"
                        onClick={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }}
                    >
                        <div className="ak-modal" style={{ maxWidth: 460, display: 'flex', flexDirection: 'column', maxHeight: 'min(86svh, 86dvh)' }}>
                            <div className="ak-modal__head" style={{ gap: 10 }}>
                                <span className="ak-vhub-title" style={{ fontSize: 15 }}>Voiceover</span>
                                <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={() => setOpen(false)} disabled={busy} aria-label="Close">
                                    <X size={15} />
                                </button>
                            </div>

                            <div className="ak-modal__body" style={{ overflowY: 'auto', flex: 1 }}>
                                <textarea
                                    className="ak-field__input"
                                    style={{ height: 'auto', padding: 10, resize: 'vertical', width: '100%' }}
                                    rows={4}
                                    placeholder="What should the voice say?"
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    disabled={busy}
                                    autoFocus
                                />

                                <select
                                    className="ak-field__input"
                                    style={{ marginTop: 10, width: '100%' }}
                                    value={voice}
                                    onChange={(e) => setVoice(e.target.value)}
                                    disabled={busy || !voices.length}
                                >
                                    {voices.length === 0 && <option>Loading voices…</option>}
                                    {voices.map((v) => (
                                        <option key={v.id} value={v.id}>{v.label}</option>
                                    ))}
                                </select>

                                {error && <div className="ak-auth__err" style={{ marginTop: 10, textAlign: 'left' }}>{error}</div>}

                                <span className="st-hint" style={{ display: 'block', marginTop: 10 }}>
                                    Runs on your device, free. English voices only. Kokoro has no emotion
                                    controls, so pick the voice that fits. Voices are sorted best first.
                                </span>
                            </div>

                            <div className="ak-modal__foot">
                                <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={() => setOpen(false)} disabled={busy}>
                                    Cancel
                                </button>
                                <button
                                    className="ak-btn ak-btn--primary ak-btn--sm"
                                    onClick={generate}
                                    disabled={!text.trim() || busy || !voices.length}
                                >
                                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Mic size={13} />}
                                    {status || 'Generate'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
