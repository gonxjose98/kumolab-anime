'use client';

import { useRef, useState } from 'react';
import { Upload, Plus, Type, ChevronDown } from 'lucide-react';
import { useProjectStore } from './store/projectStore';
import { usePlaybackStore } from './store/playbackStore';
import { useMediaStore } from './store/mediaStore';
import { probeMedia } from './store/blobStore';
import { addAssetToTimeline, addTextClip } from './clipFactory';
import { uid, type MediaAsset } from './types';

/** Left rail: the project's media assets + import (post original is added by the app). */
export default function MediaLibrary() {
    const project = useProjectStore((s) => s.project);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    // Collapsible on mobile (a dropdown); always expanded on desktop via CSS.
    const [open, setOpen] = useState(false);

    if (!project) return null;

    async function importFiles(files: FileList | null) {
        if (!files || !files.length) return;
        setBusy(true);
        setErr(null);
        try {
            for (const file of Array.from(files)) {
                const kind: MediaAsset['kind'] = file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('image/') ? 'image' : 'video';
                const id = uid();
                const url = await useMediaStore.getState().register(id, file, id);
                let probe = { durationSec: 0, width: 0, height: 0, hasAudio: kind !== 'image' };
                try { probe = await probeMedia(url, kind); } catch { /* keep defaults */ }
                const asset: MediaAsset = {
                    id, kind, name: file.name, origin: 'opfs', opfsKey: id,
                    durationSec: probe.durationSec, width: probe.width, height: probe.height,
                    hasAudio: probe.hasAudio, createdAt: Date.now(),
                };
                useProjectStore.getState().addMedia(asset);
            }
        } catch (e: any) {
            setErr(e?.message || 'Import failed');
        } finally {
            setBusy(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    }

    return (
        <div className={`st-panel st-library ${open ? 'st-library--open' : ''}`}>
            <div className="st-panel__head st-library__head" onClick={() => setOpen((o) => !o)}>
                <span className="ak-overline">Media</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button className="ak-btn ak-btn--secondary ak-btn--sm" disabled={busy} onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>
                        <Upload size={13} /> {busy ? '…' : 'Import'}
                    </button>
                    <ChevronDown size={16} className="st-collapse-chevron" aria-hidden />
                </div>
                <input ref={fileRef} type="file" accept="video/*,audio/*,image/*" multiple hidden onChange={(e) => importFiles(e.target.files)} />
            </div>
            <div className="st-panel__body">
                {err && <div className="ak-auth__err" style={{ marginBottom: 10, textAlign: 'left' }}>{err}</div>}

                <button className="ak-btn ak-btn--ghost ak-btn--sm ak-btn--block" style={{ marginBottom: 12 }}
                    onClick={() => addTextClip(usePlaybackStore.getState().currentTime)}>
                    <Type size={13} /> Add text
                </button>

                {project.media.length === 0 ? (
                    <div className="st-drop" onClick={() => fileRef.current?.click()}>
                        Import a video, image, or audio to start.
                    </div>
                ) : (
                    <div className="st-media-grid">
                        {project.media.map((asset) => (
                            <AssetTile key={asset.id} asset={asset} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function AssetTile({ asset }: { asset: MediaAsset }) {
    const url = useMediaStore((s) => s.entries[asset.id]?.url);
    return (
        <div className="st-asset" title={asset.name} onDoubleClick={() => addAssetToTimeline(asset)}>
            {asset.kind === 'image' && url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" />
            ) : asset.kind === 'video' && url ? (
                <video src={url} muted preload="metadata" />
            ) : (
                <span className="ak-caption">{asset.kind}</span>
            )}
            <span className="st-asset__badge">{asset.kind}</span>
            <span className="st-asset__name">{asset.name}</span>
            <button
                className="ak-btn ak-btn--primary ak-btn--sm"
                style={{ position: 'absolute', top: 4, right: 4, height: 22, padding: '0 6px' }}
                onClick={(e) => { e.stopPropagation(); addAssetToTimeline(asset); }}
                title="Add to timeline"
            >
                <Plus size={12} />
            </button>
        </div>
    );
}
