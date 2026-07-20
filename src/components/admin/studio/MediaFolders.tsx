'use client';

/**
 * Studio > Media — folders of RAW images/videos (loose assets, NOT posts).
 *
 * Jose + team create folders and drop raw pictures/videos into them; later
 * flows (carousel building) pull images out of a folder. Nothing here touches
 * the publish pipeline.
 *
 * Upload flow (same signed-PUT path the manual uploader uses, so large
 * videos work): /api/admin/upload-sign → PUT file to signedUrl → register
 * the asset via POST /api/admin/studio/media.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, Folder, FolderPlus, Images, Loader2, Play, Plus, Trash2, Upload,
} from 'lucide-react';
import MediaPickerModal from './MediaPickerModal';

interface FolderRow {
    id: string;
    name: string;
    created_by: string | null;
    created_at: string;
    count: number;
    cover: string | null;
}

interface MediaRow {
    id: string;
    url: string;
    kind: 'image' | 'video';
    filename: string | null;
    uploaded_by: string | null;
    created_at: string;
}

function timeAgo(iso?: string | null): string {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 3_600_000) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
}

async function api(path: string, init?: RequestInit) {
    const res = await fetch(path, { credentials: 'same-origin', ...init });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) throw new Error(json.error || `Request failed (HTTP ${res.status})`);
    return json;
}

export default function MediaFolders() {
    const router = useRouter();
    const [folders, setFolders] = useState<FolderRow[]>([]);
    const [actor, setActor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Folder-detail view
    const [open, setOpen] = useState<FolderRow | null>(null);
    const [media, setMedia] = useState<MediaRow[]>([]);
    const [mediaLoading, setMediaLoading] = useState(false);

    // Create-folder inline form
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [savingFolder, setSavingFolder] = useState(false);

    // Upload progress: "2/5" while a batch runs
    const [uploadNow, setUploadNow] = useState(0);
    const [uploadTotal, setUploadTotal] = useState(0);
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    // "Build carousel": picker over this folder's images → new draft post.
    const [pickerOpen, setPickerOpen] = useState(false);

    const loadFolders = useCallback(async () => {
        try {
            const json = await api('/api/admin/studio/folders');
            setFolders(json.folders || []);
            setActor(json.actor || null);
            setError(null);
        } catch (e: any) {
            setError(e?.message || 'Could not load folders');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadFolders(); }, [loadFolders]);

    const loadMedia = useCallback(async (folderId: string) => {
        setMediaLoading(true);
        try {
            const json = await api(`/api/admin/studio/media?folderId=${encodeURIComponent(folderId)}`);
            setMedia(json.media || []);
            setError(null);
        } catch (e: any) {
            setError(e?.message || 'Could not load media');
        } finally {
            setMediaLoading(false);
        }
    }, []);

    function openFolder(f: FolderRow) {
        setOpen(f);
        setMedia([]);
        loadMedia(f.id);
    }

    async function createFolder() {
        const name = newName.trim();
        if (!name || savingFolder) return;
        setSavingFolder(true);
        try {
            const json = await api('/api/admin/studio/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            setFolders((prev) => [json.folder, ...prev]);
            setNewName('');
            setCreating(false);
            setError(null);
        } catch (e: any) {
            setError(e?.message || 'Could not create the folder');
        } finally {
            setSavingFolder(false);
        }
    }

    async function deleteFolder(f: FolderRow) {
        const what = f.count > 0 ? `"${f.name}" and its ${f.count} item${f.count === 1 ? '' : 's'}` : `"${f.name}"`;
        if (!window.confirm(`Delete ${what} from the library? Uploaded files stay in storage.`)) return;
        setBusyId(f.id);
        try {
            await api(`/api/admin/studio/folders?id=${encodeURIComponent(f.id)}`, { method: 'DELETE' });
            setFolders((prev) => prev.filter((x) => x.id !== f.id));
            if (open?.id === f.id) setOpen(null);
            setError(null);
        } catch (e: any) {
            setError(e?.message || 'Could not delete the folder');
        } finally {
            setBusyId(null);
        }
    }

    async function uploadFiles(list: FileList | null) {
        if (!open || !list || list.length === 0) return;
        const files = Array.from(list);
        setUploadTotal(files.length);
        setUploadNow(0);
        const failures: string[] = [];
        for (const [i, file] of files.entries()) {
            setUploadNow(i + 1);
            try {
                const isVideo = file.type.startsWith('video/');
                const isImage = file.type.startsWith('image/');
                if (!isVideo && !isImage) throw new Error('not an image or video');

                // 1) signed upload URL (admin-gated; handles large files)
                const sign = await api('/api/admin/upload-sign', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mediaType: isVideo ? 'video' : 'image', filename: file.name }),
                });

                // 2) PUT the bytes straight to storage
                const putRes = await fetch(sign.signedUrl, {
                    method: 'PUT',
                    body: file,
                    headers: { 'Content-Type': file.type, 'x-upsert': 'false' },
                });
                if (!putRes.ok) throw new Error(`upload failed (HTTP ${putRes.status})`);

                // 3) register the asset in the folder
                const reg = await api('/api/admin/studio/media', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        folderId: open.id,
                        url: sign.publicUrl,
                        kind: isVideo ? 'video' : 'image',
                        filename: file.name,
                        mime: file.type,
                    }),
                });
                setMedia((prev) => [reg.media, ...prev]);
                setFolders((prev) => prev.map((f) => (f.id === open.id
                    ? { ...f, count: f.count + 1, cover: f.cover || (reg.media.kind === 'image' ? reg.media.url : null) }
                    : f)));
            } catch (e: any) {
                failures.push(`${file.name}: ${e?.message || 'failed'}`);
            }
        }
        setUploadTotal(0);
        setUploadNow(0);
        setError(failures.length ? `Some uploads failed — ${failures.join('; ')}` : null);
    }

    async function deleteMedia(m: MediaRow) {
        if (!open) return;
        if (!window.confirm(`Remove ${m.filename || 'this file'} from the folder? The file stays in storage.`)) return;
        setBusyId(m.id);
        try {
            await api(`/api/admin/studio/media?id=${encodeURIComponent(m.id)}`, { method: 'DELETE' });
            setMedia((prev) => prev.filter((x) => x.id !== m.id));
            setFolders((prev) => prev.map((f) => (f.id === open.id ? { ...f, count: Math.max(0, f.count - 1) } : f)));
            setError(null);
        } catch (e: any) {
            setError(e?.message || 'Could not remove the file');
        } finally {
            setBusyId(null);
        }
    }

    // Turn the picked library images into ONE draft post and open its editor.
    // Same endpoint + shape ImageHub's multi-upload uses: 2+ urls → a draft
    // whose image_settings.slides has one slide per picture (a carousel);
    // a single url stays the classic single-image draft. Thrown errors are
    // shown inside the picker (it stays open for a retry).
    async function buildCarousel(urls: string[]) {
        const json = await api('/api/admin/studio/new-image-post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls }),
        });
        if (!json.id) throw new Error('Draft was created without an id');
        router.push(`/admin/post/${json.id}`);
        router.refresh();
    }

    const uploading = uploadTotal > 0;

    // ---------- Folder detail ----------
    if (open) {
        return (
            <div className="max-w-6xl mx-auto">
                <div className="ak-studio-head" style={{ flexWrap: 'wrap', gap: 10 }}>
                    <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={() => { setOpen(null); loadFolders(); }}>
                        <ArrowLeft size={14} /> All folders
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                        <Folder size={16} strokeWidth={1.9} />
                        <span className="ak-vhub-title" style={{ fontSize: 15 }}>{open.name}</span>
                        <span className="ak-caption">{media.length} item{media.length === 1 ? '' : 's'}</span>
                    </div>
                    <input
                        ref={fileRef}
                        type="file"
                        multiple
                        accept="image/*,video/*"
                        style={{ display: 'none' }}
                        onChange={(e) => { uploadFiles(e.target.files); e.target.value = ''; }}
                    />
                    <button
                        className="ak-btn ak-btn--secondary ak-btn--sm"
                        onClick={() => setPickerOpen(true)}
                        disabled={uploading || mediaLoading || media.every((m) => m.kind !== 'image')}
                        title={media.some((m) => m.kind === 'image')
                            ? 'Pick pictures from this folder and open them as a carousel draft'
                            : 'Upload pictures first — carousels are built from images'}
                    >
                        <Images size={14} /> Build carousel
                    </button>
                    <button className="ak-btn ak-btn--primary ak-btn--sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        {uploading ? `Uploading ${uploadNow}/${uploadTotal}…` : 'Upload'}
                    </button>
                </div>

                {pickerOpen && (
                    <MediaPickerModal
                        title="Build a carousel"
                        initialFolder={{ id: open.id, name: open.name }}
                        confirmLabel={(n) => (n <= 1 ? `Create post (${n})` : `Build carousel (${n})`)}
                        onClose={() => setPickerOpen(false)}
                        onConfirm={buildCarousel}
                    />
                )}

                {actor && <p className="ak-caption" style={{ marginBottom: 14 }}>Uploading as {actor}</p>}
                {error && <div className="ak-alert ak-alert--error" style={{ marginBottom: 14 }}>{error}</div>}

                {mediaLoading ? (
                    <div className="ak-empty"><p className="ak-body-sm">Loading…</p></div>
                ) : media.length === 0 && !uploading ? (
                    <div className="ak-empty">
                        <span className="ak-empty__glyph" aria-hidden="true">雲</span>
                        <p className="ak-body-sm">No media yet. Upload raw pictures or videos to fill this folder.</p>
                    </div>
                ) : (
                    <div className="ak-vhub-grid">
                        {media.map((m) => (
                            <div key={m.id} className="ak-vhub-card" style={{ cursor: 'default' }}>
                                <div className="ak-vhub-thumb">
                                    {m.kind === 'video' ? (
                                        <>
                                            {/* muted metadata-only load shows the poster frame */}
                                            <video src={m.url} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            <span className="ak-vhub-play"><Play size={16} fill="currentColor" /></span>
                                        </>
                                    ) : (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={m.url} alt={m.filename || ''} loading="lazy" />
                                    )}
                                </div>
                                <div className="ak-vhub-meta">
                                    <div className="ak-vhub-title" title={m.filename || ''}>{m.filename || (m.kind === 'video' ? 'Video' : 'Image')}</div>
                                    <div className="ak-vhub-row">
                                        <span className="ak-caption">
                                            {m.uploaded_by ? `${m.uploaded_by} · ` : ''}{timeAgo(m.created_at)}
                                        </span>
                                        <button
                                            className="ak-btn ak-btn--ghost ak-btn--sm"
                                            onClick={() => deleteMedia(m)}
                                            disabled={busyId === m.id}
                                            aria-label="Remove from folder"
                                            title="Remove from folder"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    // ---------- Folder list ----------
    return (
        <div className="max-w-6xl mx-auto">
            <div className="ak-studio-head" style={{ flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <Folder size={16} strokeWidth={1.9} />
                    <span className="ak-vhub-title" style={{ fontSize: 15 }}>Media folders</span>
                    <span className="ak-caption">raw pictures &amp; videos, not posts</span>
                </div>
                {creating ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                            autoFocus
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setCreating(false); setNewName(''); } }}
                            placeholder="Folder name…"
                            className="ak-field__input"
                            style={{ height: 34, width: 200 }}
                            maxLength={80}
                        />
                        <button className="ak-btn ak-btn--primary ak-btn--sm" onClick={createFolder} disabled={savingFolder || !newName.trim()}>
                            {savingFolder ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create
                        </button>
                    </div>
                ) : (
                    <button className="ak-btn ak-btn--primary ak-btn--sm" onClick={() => setCreating(true)}>
                        <FolderPlus size={14} /> New folder
                    </button>
                )}
            </div>

            {error && <div className="ak-alert ak-alert--error" style={{ marginBottom: 14 }}>{error}</div>}

            {loading ? (
                <div className="ak-empty"><p className="ak-body-sm">Loading…</p></div>
            ) : folders.length === 0 ? (
                <div className="ak-empty">
                    <span className="ak-empty__glyph" aria-hidden="true">雲</span>
                    <p className="ak-body-sm">No folders yet. Create one to start collecting raw media.</p>
                </div>
            ) : (
                <div className="ak-vhub-grid">
                    {folders.map((f) => (
                        <div
                            key={f.id}
                            className="ak-vhub-card"
                            role="button"
                            tabIndex={0}
                            onClick={() => openFolder(f)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFolder(f); } }}
                            style={{ cursor: 'pointer' }}
                            title="Open folder"
                        >
                            <div className="ak-vhub-thumb">
                                {f.cover ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={f.cover} alt="" loading="lazy" />
                                ) : (
                                    <span className="ak-vhub-thumb__fallback"><Folder size={26} /></span>
                                )}
                            </div>
                            <div className="ak-vhub-meta">
                                <div className="ak-vhub-title">{f.name}</div>
                                <div className="ak-vhub-row">
                                    <span className="ak-caption">
                                        {f.count} item{f.count === 1 ? '' : 's'}
                                        {f.created_by ? ` · ${f.created_by}` : ''} · {timeAgo(f.created_at)}
                                    </span>
                                    <button
                                        className="ak-btn ak-btn--ghost ak-btn--sm"
                                        onClick={(e) => { e.stopPropagation(); deleteFolder(f); }}
                                        disabled={busyId === f.id}
                                        aria-label={`Delete folder ${f.name}`}
                                        title="Delete folder"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
