'use client';

import { useRef, useState } from 'react';
import { Upload, Plus, Type, ChevronDown, FolderOpen, CloudUpload, CloudOff, Check } from 'lucide-react';
import { useProjectStore } from './store/projectStore';
import { usePlaybackStore } from './store/playbackStore';
import { useMediaStore } from './store/mediaStore';
import { probeMedia } from './store/blobStore';
import { addAssetToTimeline, addTextClip } from './clipFactory';
import { uid, type MediaAsset } from './types';
import MediaPickerModal, { type PickedMedia } from './MediaPickerModal';
import SaveToLibrarySheet from './SaveToLibrarySheet';
import { archiveToLibrary, canArchive, type LibraryKind } from './libraryUpload';
import AutoCaptionsButton from './AutoCaptionsButton';
import VoiceoverPanel from './VoiceoverPanel';

/** KumoLab-branded assets available in every project by default. They are NOT
 *  auto-placed; tapping one adds it to the timeline on demand. Bytes are pulled
 *  from /public on first use and cached like any other remote media. */
const PRESETS: { name: string; url: string }[] = [
    { name: 'KumoLab mark (gold)', url: '/kumolab-cloud-mark-gold.png' },
];

/** Drop a preset onto the timeline as its own image clip. A fresh id each time
 *  allows multiple placements; remoteUrl lets preview + export fetch the bytes. */
function addPreset(p: { name: string; url: string }) {
    const asset: MediaAsset = {
        id: uid(), kind: 'image', name: p.name, origin: 'upload',
        remoteUrl: p.url, durationSec: 0, createdAt: Date.now(),
    };
    const store = useProjectStore.getState();
    store.addMedia(asset);
    const clipId = addAssetToTimeline(asset);
    // A logo is an OVERLAY, not a base layer: paint it in front of the video
    // (high z, like text), keep it transparent (no background fill), and size it
    // as a mark rather than a full frame.
    store.updateClip(clipId, {
        z: 20,
        transform: { xPct: 0.5, yPct: 0.5, scale: 0.4, rotationDeg: 0, opacity: 1, fit: 'contain', fillStyle: undefined },
    });
    store.select([clipId]);
}

/** One imported file still holding its File, so it can be archived after the fact. */
interface Archivable { assetId: string; file: File; kind: LibraryKind }

/** Per-asset archive status, surfaced on the tile. */
type SaveState = 'saving' | 'saved' | 'error';

/** Left rail: the project's media assets + import (post original is added by the app). */
export default function MediaLibrary() {
    const project = useProjectStore((s) => s.project);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    // Collapsible on mobile (a dropdown); always expanded on desktop via CSS.
    const [open, setOpen] = useState(false);
    // Library picker (read side).
    const [pickerOpen, setPickerOpen] = useState(false);
    // Archive prompt (write side). Holds the File objects because importFiles
    // clears the input's value, so they can't be re-read from the element.
    const [pendingSave, setPendingSave] = useState<Archivable[]>([]);
    const [saveState, setSaveState] = useState<Record<string, SaveState>>({});
    // Kept so a failed upload can be retried against the same folder.
    const [lastFolder, setLastFolder] = useState<{ id: string; name: string } | null>(null);
    const [retryable, setRetryable] = useState<Record<string, Archivable>>({});

    if (!project) return null;

    async function importFiles(files: FileList | null) {
        if (!files || !files.length) return;
        setBusy(true);
        setErr(null);
        const archivable: Archivable[] = [];
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
                // Audio can't live in the library, so it is never offered.
                if (canArchive(kind)) archivable.push({ assetId: id, file, kind });
            }
        } catch (e: any) {
            setErr(e?.message || 'Import failed');
        } finally {
            setBusy(false);
            if (fileRef.current) fileRef.current.value = '';
        }
        // Offer archiving only after the media is already usable, so the
        // decision never sits between the operator and their edit.
        if (archivable.length) setPendingSave(archivable);
    }

    /** Upload the pending batch into a folder, in the background. */
    function startArchive(folder: { id: string; name: string }) {
        const batch = pendingSave;
        setPendingSave([]);
        setLastFolder(folder);
        for (const item of batch) void archiveOne(item, folder.id);
    }

    async function archiveOne(item: Archivable, folderId: string) {
        setSaveState((s) => ({ ...s, [item.assetId]: 'saving' }));
        try {
            const publicUrl = await archiveToLibrary(item.file, item.kind, folderId);
            // Record where it landed WITHOUT touching what the timeline plays:
            // the local OPFS copy stays the source. This is purely so the
            // project still opens on another device.
            useProjectStore.getState().setMediaRemoteUrl(item.assetId, publicUrl);
            setSaveState((s) => ({ ...s, [item.assetId]: 'saved' }));
            setRetryable((r) => { const n = { ...r }; delete n[item.assetId]; return n; });
        } catch (e: any) {
            console.error('[library] archive failed', e?.message || e);
            setSaveState((s) => ({ ...s, [item.assetId]: 'error' }));
            setRetryable((r) => ({ ...r, [item.assetId]: item }));
        }
    }

    /** Bring library picks in as project media, optionally onto the timeline. */
    async function addFromLibrary(picked: PickedMedia[], toTimeline: boolean) {
        // Sequential on purpose: tap order must become clip order, and
        // addAssetToTimeline appends at the track end.
        for (const p of picked) {
            let probe = { durationSec: 0, width: 0, height: 0, hasAudio: p.kind !== 'image' };
            try { probe = await probeMedia(p.url, p.kind); } catch { /* keep defaults */ }
            const asset: MediaAsset = {
                id: uid(),
                kind: p.kind,
                name: p.filename || 'Library item',
                origin: 'upload',
                remoteUrl: p.url,
                durationSec: probe.durationSec,
                width: probe.width,
                height: probe.height,
                hasAudio: probe.hasAudio,
                createdAt: Date.now(),
            };
            useProjectStore.getState().addMedia(asset);
            if (toTimeline) addAssetToTimeline(asset);
        }
        setPickerOpen(false);
    }

    return (
        <div className={`st-panel st-library ${open ? 'st-library--open' : ''}`}>
            <div className="st-panel__head st-library__head" onClick={() => setOpen((o) => !o)}>
                <span className="ak-overline">Media</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                        className="ak-btn ak-btn--secondary ak-btn--sm"
                        onClick={(e) => { e.stopPropagation(); setPickerOpen(true); }}
                        title="Pick from your media-library folders"
                    >
                        <FolderOpen size={13} /> Library
                    </button>
                    <button className="ak-btn ak-btn--secondary ak-btn--sm" disabled={busy} onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>
                        <Upload size={13} /> {busy ? '…' : 'Import'}
                    </button>
                    <ChevronDown size={16} className="st-collapse-chevron" aria-hidden />
                </div>
                <input ref={fileRef} type="file" accept="video/*,audio/*,image/*" multiple hidden onChange={(e) => importFiles(e.target.files)} />
            </div>
            <div className="st-panel__body">
                {err && <div className="ak-auth__err" style={{ marginBottom: 10, textAlign: 'left' }}>{err}</div>}

                <button className="ak-btn ak-btn--ghost ak-btn--sm ak-btn--block" style={{ marginBottom: 8 }}
                    onClick={() => addTextClip(usePlaybackStore.getState().currentTime)}>
                    <Type size={13} /> Add text
                </button>

                <div style={{ marginBottom: 8 }}>
                    <AutoCaptionsButton />
                </div>

                <VoiceoverPanel />

                {/* KumoLab presets — always available, added on tap (never auto-placed). */}
                <div className="st-preset-label">Presets</div>
                <div className="st-media-grid" style={{ marginBottom: 16 }}>
                    {PRESETS.map((p) => (
                        <button key={p.url} type="button" className="st-asset st-asset--preset" title={`Add ${p.name}`} onClick={() => addPreset(p)}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.url} alt={p.name} />
                            <span className="st-asset__badge">logo</span>
                            <span className="st-asset__name">{p.name}</span>
                        </button>
                    ))}
                </div>

                {project.media.length === 0 ? (
                    <div className="st-drop" onClick={() => fileRef.current?.click()}>
                        Import a video, image, or audio to start.
                    </div>
                ) : (
                    <div className="st-media-grid">
                        {project.media.map((asset) => (
                            <AssetTile
                                key={asset.id}
                                asset={asset}
                                save={saveState[asset.id]}
                                onRetry={retryable[asset.id] && lastFolder
                                    ? () => archiveOne(retryable[asset.id], lastFolder.id)
                                    : undefined}
                            />
                        ))}
                    </div>
                )}
            </div>

            {pickerOpen && (
                <MediaPickerModal
                    title="Add from library"
                    kinds={['image', 'video']}
                    confirmLabel={(n) => (n ? `Add ${n} to timeline` : 'Add to timeline')}
                    onConfirmDetailed={(picked) => addFromLibrary(picked, true)}
                    secondaryLabel={() => 'Add to pool'}
                    onConfirmSecondary={(picked) => addFromLibrary(picked, false)}
                    onClose={() => setPickerOpen(false)}
                />
            )}

            {pendingSave.length > 0 && (
                <SaveToLibrarySheet
                    fileCount={pendingSave.length}
                    onPick={startArchive}
                    onSkip={() => setPendingSave([])}
                />
            )}
        </div>
    );
}

function AssetTile({ asset, save, onRetry }: { asset: MediaAsset; save?: SaveState; onRetry?: () => void }) {
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
            {/* Archive status — per item, so one failure is visible and
                retryable without implying anything about the others. */}
            {save && (
                <span
                    onClick={(e) => { if (save === 'error' && onRetry) { e.stopPropagation(); onRetry(); } }}
                    title={save === 'saving' ? 'Saving to library…'
                        : save === 'saved' ? 'Saved to library'
                        : 'Save failed — tap to retry'}
                    style={{
                        position: 'absolute', top: 4, left: 4, width: 20, height: 20,
                        borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(10,23,48,0.72)', color: '#fff',
                        cursor: save === 'error' && onRetry ? 'pointer' : 'default',
                    }}
                >
                    {save === 'saving' ? <CloudUpload size={11} />
                        : save === 'saved' ? <Check size={11} strokeWidth={3} />
                        : <CloudOff size={11} />}
                </span>
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
