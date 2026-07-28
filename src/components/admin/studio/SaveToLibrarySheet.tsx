'use client';

/**
 * "Save to library?" — shown AFTER a device import has already registered
 * locally, so the operator can start editing immediately and the archiving
 * decision never blocks them. Skipping is a first-class option: a throwaway
 * one-off edit shouldn't force an upload or a filing decision.
 *
 * Only ever offered for image/video (see canArchive) — the library cannot
 * store audio.
 */

import { useCallback, useEffect, useState } from 'react';
import { Folder, FolderPlus, Loader2, X } from 'lucide-react';

interface SheetFolder {
    id: string;
    name: string;
    count: number;
}

export default function SaveToLibrarySheet({
    fileCount,
    onPick,
    onSkip,
}: {
    /** How many files would be archived — shown so the choice is concrete. */
    fileCount: number;
    onPick: (folder: { id: string; name: string }) => void;
    onSkip: () => void;
}) {
    const [folders, setFolders] = useState<SheetFolder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/studio/folders', { credentials: 'same-origin' });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) throw new Error(json.error || 'Could not load folders');
            setFolders(json.folders || []);
            setError(null);
        } catch (e: any) {
            setError(e?.message || 'Could not load folders');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Escape skips — same as declining.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !creating) onSkip(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onSkip, creating]);

    async function createFolder() {
        const name = newName.trim();
        if (!name || creating) return;
        setCreating(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/studio/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ name }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) throw new Error(json.error || 'Could not create folder');
            onPick({ id: json.folder.id, name: json.folder.name });
        } catch (e: any) {
            setError(e?.message || 'Could not create folder');
            setCreating(false);
        }
    }

    return (
        <div
            className="ak-modal__scrim"
            onClick={(e) => { if (e.target === e.currentTarget && !creating) onSkip(); }}
            role="dialog"
            aria-modal="true"
            aria-label="Save to library"
        >
            <div className="ak-modal" style={{ maxWidth: 460, display: 'flex', flexDirection: 'column', maxHeight: 'min(80svh, 80dvh)' }}>
                <div className="ak-modal__head" style={{ gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                        <span className="ak-vhub-title" style={{ fontSize: 15 }}>Save to library?</span>
                        <div className="ak-caption" style={{ marginTop: 2 }}>
                            File {fileCount === 1 ? 'this clip' : `these ${fileCount} clips`} in a folder so you can reuse
                            {fileCount === 1 ? ' it' : ' them'} later. Uploads in the background — keep editing.
                        </div>
                    </div>
                    <button
                        className="ak-btn ak-btn--ghost ak-btn--sm"
                        onClick={onSkip}
                        disabled={creating}
                        aria-label="Skip"
                        title="Skip"
                        type="button"
                    >
                        <X size={15} />
                    </button>
                </div>

                <div className="ak-modal__body" style={{ overflowY: 'auto', flex: 1, minHeight: 120 }}>
                    {error && <div className="ak-auth__err" style={{ marginBottom: 12 }}>{error}</div>}

                    {loading ? (
                        <p className="ak-body-sm">Loading folders…</p>
                    ) : (
                        <>
                            {folders.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                                    {folders.map((f) => (
                                        <button
                                            key={f.id}
                                            type="button"
                                            className="ak-btn ak-btn--secondary"
                                            onClick={() => onPick({ id: f.id, name: f.name })}
                                            disabled={creating}
                                            style={{ justifyContent: 'flex-start', gap: 10 }}
                                        >
                                            <Folder size={14} strokeWidth={1.9} />
                                            <span style={{ flex: 1, textAlign: 'left', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {f.name}
                                            </span>
                                            <span className="ak-caption">{f.count}</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="ak-overline" style={{ marginBottom: 6 }}>
                                {folders.length === 0 ? 'Create your first folder' : 'New folder'}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    className="ak-field__input"
                                    style={{ flex: 1 }}
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createFolder(); } }}
                                    placeholder="e.g. Aesthetic scenes"
                                    disabled={creating}
                                    maxLength={60}
                                />
                                <button
                                    className="ak-btn ak-btn--primary"
                                    onClick={createFolder}
                                    disabled={!newName.trim() || creating}
                                    type="button"
                                >
                                    {creating ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}
                                    Create
                                </button>
                            </div>
                        </>
                    )}
                </div>

                <div className="ak-modal__foot">
                    <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={onSkip} disabled={creating} type="button">
                        Skip
                    </button>
                </div>
            </div>
        </div>
    );
}
