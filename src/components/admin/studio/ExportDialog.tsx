'use client';

import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useProjectStore } from './store/projectStore';
import { renderProject } from './export/renderProject';
import ExportScheduleSheet from './ExportScheduleSheet';
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
    // Which flow is running/ran: the full export (upload + attach) or the
    // standalone "download to device" render. Lets the progress UI label the
    // work and lets a finished download show its confirmation note without
    // ever touching the export's phase='done' → schedule-sheet handoff.
    const [mode, setMode] = useState<'export' | 'download'>('export');
    // Filename of the last successful device download (confirmation note).
    const [downloadedAs, setDownloadedAs] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const project = useProjectStore.getState().project;
    const watermark = useProjectStore((s) => s.project?.meta.watermark ?? true);
    const dur = project?.durationSec ?? 0;
    const overCap = dur > CAPS.maxDurationSec;
    const busy = phase === 'rendering' || phase === 'uploading';

    // Standalone "just give me the file" path: same in-browser render the
    // export uses, but the MP4 goes straight to the device via an <a download>
    // object URL. No upload, no finalize, nothing attached to the post.
    async function downloadToDevice() {
        if (!project) return;
        const p = PRESETS.find((x) => x.key === preset)!;
        setMode('download');
        setPhase('rendering');
        setError(null);
        setDownloadedAs(null);
        setProgress(0);
        const ac = new AbortController();
        abortRef.current = ac;
        try {
            const blob = await renderProject(project, {
                width: p.w, height: p.h, fps: project.meta.fps || 30,
                onProgress: (r, s) => { setProgress(r); setStage(s); },
                signal: ac.signal,
            });
            const filename = `kumolab-studio-${postId}.mp4`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            // Revoke after the browser has had time to hand the blob to its
            // download pipeline (mobile Safari needs the URL alive briefly).
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
            setDownloadedAs(filename);
            setPhase('idle');
        } catch (e: any) {
            if (e?.message === 'Export cancelled') { setPhase('idle'); return; }
            setError(e?.message || 'Download failed');
            setPhase('error');
        }
    }

    async function run() {
        if (!project) return;
        const p = PRESETS.find((x) => x.key === preset)!;
        setMode('export');
        setPhase('rendering');
        setError(null);
        setDownloadedAs(null);
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

    // After a successful export, hand off to the scheduling sheet (same scrim slot).
    if (phase === 'done') {
        return <ExportScheduleSheet postId={postId} resultUrl={resultUrl} onClose={onClose} />;
    }

    return (
        <div className="ak-modal__scrim" onClick={busy ? undefined : onClose}>
            <div className="ak-modal" onClick={(e) => e.stopPropagation()}>
                <div className="ak-modal__head">
                    <span className="ak-title">Export reel</span>
                    <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={onClose} disabled={busy}><X size={15} /></button>
                </div>
                <div className="ak-modal__body flex flex-col gap-4">
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
                        {dur > CAPS.warnDurationSec && !overCap && <span style={{ color: '#8a6420' }}> Long export: this may take a couple minutes.</span>}
                    </div>
                    {overCap && (
                        <div className="ak-auth__err" style={{ textAlign: 'left' }}>
                            Project is {dur.toFixed(0)}s, over the {CAPS.maxDurationSec}s export cap. Trim it down first.
                        </div>
                    )}

                    {busy && (
                        <div className="flex flex-col gap-2">
                            <div className="ak-caption">{mode === 'download' && phase === 'rendering' ? 'Preparing download · ' : ''}{stage}… {Math.round(progress * 100)}%</div>
                            <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.round(progress * 100)}%`, background: 'var(--gold-grad)', transition: 'width 0.2s' }} />
                            </div>
                        </div>
                    )}
                    {!busy && downloadedAs && (
                        <div className="ak-body-sm" style={{ color: 'var(--text-secondary)' }}>
                            Saved to your device as <strong>{downloadedAs}</strong>. Nothing was uploaded or attached to the post.
                        </div>
                    )}
                    {error && <div className="ak-auth__err" style={{ textAlign: 'left' }}>{error}</div>}
                </div>
                <div className="ak-modal__foot">
                    {busy ? (
                        <button className="ak-btn ak-btn--secondary" onClick={() => abortRef.current?.abort()}>Cancel</button>
                    ) : (
                        <>
                            <button className="ak-btn ak-btn--secondary" onClick={onClose}>Close</button>
                            <button
                                className="ak-btn ak-btn--secondary"
                                onClick={downloadToDevice}
                                disabled={overCap || !project?.durationSec}
                                title="Render the reel and save the MP4 straight to this device. No upload, nothing attached to the post"
                            >
                                Download to device
                            </button>
                            <button className="ak-btn ak-btn--primary" onClick={run} disabled={overCap || !project?.durationSec}>Export</button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
