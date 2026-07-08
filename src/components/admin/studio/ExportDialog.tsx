'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { useProjectStore } from './store/projectStore';
import { renderProject } from './export/renderProject';
import { CAPS } from './types';

type Phase = 'idle' | 'rendering' | 'uploading' | 'done' | 'error';

const PRESETS: { key: string; label: string; w: number; h: number }[] = [
    { key: '9x16', label: 'Vertical 9:16 (Reels)', w: 1080, h: 1920 },
    { key: '1x1', label: 'Square 1:1', w: 1080, h: 1080 },
    { key: '16x9', label: 'Landscape 16:9', w: 1920, h: 1080 },
];

export default function ExportDialog({ postId, onClose, onDone }: { postId: string; onClose: () => void; onDone: (url: string) => void }) {
    const [preset, setPreset] = useState('9x16');
    const [phase, setPhase] = useState<Phase>('idle');
    const [progress, setProgress] = useState(0);
    const [stage, setStage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [resultUrl, setResultUrl] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const project = useProjectStore.getState().project;
    const watermark = useProjectStore((s) => s.project?.meta.watermark ?? true);
    const dur = project?.durationSec ?? 0;
    const overCap = dur > CAPS.maxDurationSec;
    const busy = phase === 'rendering' || phase === 'uploading';

    async function run() {
        if (!project) return;
        const p = PRESETS.find((x) => x.key === preset)!;
        setPhase('rendering');
        setError(null);
        setProgress(0);
        const ac = new AbortController();
        abortRef.current = ac;
        try {
            // 1) Render in-browser.
            const blob = await renderProject(project, {
                width: p.w, height: p.h, fps: project.meta.fps || 30,
                onProgress: (r, s) => { setProgress(r); setStage(s); },
                signal: ac.signal,
            });

            // 2) Signed upload to blog-videos.
            setPhase('uploading');
            setStage('Uploading');
            const filename = `studio-${postId}-${Math.round(project.updatedAt)}.mp4`;
            const signRes = await fetch('/api/admin/upload-sign', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
                body: JSON.stringify({ mediaType: 'video', filename }),
            });
            const sign = await signRes.json();
            if (!signRes.ok || !sign.success) throw new Error(sign.error || 'Could not get upload URL');
            const putRes = await fetch(sign.signedUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': 'video/mp4', 'x-upsert': 'false' } });
            if (!putRes.ok) throw new Error(`Upload failed (HTTP ${putRes.status})`);

            // 3) Point the post at it (reuses the publish pipeline).
            const finRes = await fetch('/api/admin/studio/finalize', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
                body: JSON.stringify({ postId, publicUrl: sign.publicUrl, durationSec: dur, project }),
            });
            const fin = await finRes.json();
            if (!finRes.ok || !fin.success) throw new Error(fin.error || 'Finalize failed');

            setResultUrl(sign.publicUrl);
            setPhase('done');
            onDone(sign.publicUrl);
        } catch (e: any) {
            if (e?.message === 'Export cancelled') { setPhase('idle'); return; }
            setError(e?.message || 'Export failed');
            setPhase('error');
        }
    }

    return (
        <div className="ak-modal__scrim" onClick={busy ? undefined : onClose}>
            <div className="ak-modal" onClick={(e) => e.stopPropagation()}>
                <div className="ak-modal__head">
                    <span className="ak-title">Export reel</span>
                    <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={onClose} disabled={busy}><X size={15} /></button>
                </div>
                <div className="ak-modal__body flex flex-col gap-4">
                    {phase === 'done' ? (
                        <div className="text-center flex flex-col items-center gap-2" style={{ padding: '8px 0' }}>
                            <CheckCircle2 size={34} style={{ color: '#1d7a4f' }} />
                            <div className="ak-heading" style={{ color: '#1d7a4f' }}>Exported &amp; attached</div>
                            <div className="ak-caption">This reel is now what publishes for this post. Approve it from the post editor to send it live.</div>
                            {resultUrl && <a className="ak-btn ak-btn--secondary ak-btn--sm" href={resultUrl} target="_blank" rel="noopener noreferrer">Preview file ↗</a>}
                        </div>
                    ) : (
                        <>
                            <div className="ak-field">
                                <label className="ak-field__label">Format</label>
                                <select className="ak-field__input" value={preset} disabled={busy} onChange={(e) => setPreset(e.target.value)}>
                                    {PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                                </select>
                            </div>

                            <label className="ak-body-sm" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                <input type="checkbox" checked={watermark} disabled={busy}
                                    onChange={(e) => useProjectStore.getState().setMeta({ watermark: e.target.checked })} />
                                Burn in the <strong>@kumolabanime</strong> watermark
                            </label>

                            <div className="ak-body-sm">
                                Duration <strong>{dur.toFixed(1)}s</strong> · renders in your browser.
                                {dur > CAPS.warnDurationSec && !overCap && <span style={{ color: '#8a6420' }}> Long export — this may take a couple minutes.</span>}
                            </div>
                            {overCap && (
                                <div className="ak-auth__err" style={{ textAlign: 'left' }}>
                                    Project is {dur.toFixed(0)}s — over the {CAPS.maxDurationSec}s export cap. Trim it down first.
                                </div>
                            )}

                            {busy && (
                                <div className="flex flex-col gap-2">
                                    <div className="ak-caption">{stage}… {Math.round(progress * 100)}%</div>
                                    <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${Math.round(progress * 100)}%`, background: 'var(--gold-grad)', transition: 'width 0.2s' }} />
                                    </div>
                                </div>
                            )}
                            {error && <div className="ak-auth__err" style={{ textAlign: 'left' }}>{error}</div>}
                        </>
                    )}
                </div>
                <div className="ak-modal__foot">
                    {phase === 'done' ? (
                        <button className="ak-btn ak-btn--primary" onClick={onClose}>Done</button>
                    ) : busy ? (
                        <button className="ak-btn ak-btn--secondary" onClick={() => abortRef.current?.abort()}>Cancel</button>
                    ) : (
                        <>
                            <button className="ak-btn ak-btn--secondary" onClick={onClose}>Close</button>
                            <button className="ak-btn ak-btn--primary" onClick={run} disabled={overCap || !project?.durationSec}>Export</button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
