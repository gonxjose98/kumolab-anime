'use client';

/**
 * MediaPickerModal — pick media out of the Studio media library (the raw
 * folders from Studio > Media).
 *
 * Reusable in three places:
 *   1. MediaFolders "Build carousel": select 2+ pictures from a folder and
 *      spin up a fresh carousel draft.
 *   2. The post editor's "Add from library": append the selected pictures as
 *      new slides on the post being edited.
 *   3. Studio's "Library" button: pull images AND video into the editor.
 *
 * Read-only against the library: it only GETs /api/admin/studio/folders and
 * /api/admin/studio/media?folderId= — never writes.
 *
 * `kinds` controls what is selectable and defaults to ['image'], so the two
 * carousel call sites (which pass nothing) behave exactly as they always have:
 * video renders visible but disabled, because a video can't be a carousel
 * slide. Studio passes ['image','video'].
 *
 * Selection is ordered by tap order, which becomes slide/clip order.
 *
 * crossOrigin="anonymous" on every thumbnail is REQUIRED, not cosmetic: Studio
 * runs under Cross-Origin-Embedder-Policy: require-corp (next.config.mjs), and
 * a no-cors element load of a storage URL is blocked there. Without it every
 * thumbnail renders blank when this modal is opened from the Studio route.
 */

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Folder, Loader2, Play, X } from 'lucide-react';

interface PickerFolder {
    id: string;
    name: string;
    count: number;
    cover: string | null;
}

export type MediaKind = 'image' | 'video';

export interface PickedMedia {
    id: string;
    url: string;
    kind: MediaKind;
    filename: string | null;
}

type PickerMedia = PickedMedia;

interface MediaPickerModalBaseProps {
    /** Heading in the modal header. */
    title?: string;
    /** Confirm-button label for the current selection count, e.g. (n) => `Add ${n} slides`. */
    confirmLabel: (count: number) => string;
    /** Open directly inside this folder (e.g. the folder the user is viewing). */
    initialFolder?: { id: string; name: string } | null;
    /**
     * Which kinds are selectable. Defaults to images only — the carousel call
     * sites rely on that default, so don't change it.
     */
    kinds?: MediaKind[];
    onClose: () => void;
    /** Optional second confirm action, e.g. "Add to pool" beside "Add to timeline". */
    secondaryLabel?: (count: number) => string;
    onConfirmSecondary?: (picked: PickedMedia[]) => void | Promise<void>;
}

/**
 * Exactly one confirm style, enforced by the type.
 *
 * `onConfirm` is the original URL-list contract the two carousel call sites
 * use. `onConfirmDetailed` additionally carries kind + filename, which a caller
 * building a MediaAsset needs (kind to probe correctly, filename to name it)
 * and which cannot survive a bare URL list. Modelling them as a union means the
 * carousel contract is untouched and no caller can accidentally supply both or
 * neither.
 *
 * Both are called with the selection in TAP ORDER. Both may be async — the
 * modal shows a busy state while one runs and surfaces a thrown error without
 * closing, so the user can retry. The caller closes the modal (usually by
 * unmounting it) on success.
 */
type MediaPickerConfirmProps =
    | { onConfirm: (urls: string[]) => void | Promise<void>; onConfirmDetailed?: never }
    | { onConfirmDetailed: (picked: PickedMedia[]) => void | Promise<void>; onConfirm?: never };

export type MediaPickerModalProps = MediaPickerModalBaseProps & MediaPickerConfirmProps;

async function apiGet(path: string) {
    const res = await fetch(path, { credentials: 'same-origin' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) throw new Error(json.error || `Request failed (HTTP ${res.status})`);
    return json;
}

/**
 * Images only. The two carousel call sites pass no `kinds`, so this default is
 * what keeps their behaviour identical — a video can't be a carousel slide.
 * Changing it silently changes those screens.
 */
export const DEFAULT_KINDS: MediaKind[] = ['image'];

/** Whether an asset of this kind can be picked, given the allowed kinds. */
export function isSelectable(kind: MediaKind, kinds: MediaKind[] = DEFAULT_KINDS): boolean {
    return kinds.includes(kind);
}

/** Noun for the selectable kinds, used in the hint/count copy. */
function kindNoun(kinds: MediaKind[], plural: boolean): string {
    const hasImage = kinds.includes('image');
    const hasVideo = kinds.includes('video');
    if (hasImage && hasVideo) return plural ? 'items' : 'item';
    if (hasVideo) return plural ? 'videos' : 'video';
    return plural ? 'pictures' : 'picture';
}

export default function MediaPickerModal({
    title = 'Pick from media library',
    confirmLabel,
    initialFolder = null,
    kinds = DEFAULT_KINDS,
    onClose,
    onConfirm,
    onConfirmDetailed,
    secondaryLabel,
    onConfirmSecondary,
}: MediaPickerModalProps) {
    // Folder list vs folder contents. Starting inside initialFolder skips the
    // folder list until the user taps "All folders".
    const [folder, setFolder] = useState<{ id: string; name: string } | null>(initialFolder);
    const [folders, setFolders] = useState<PickerFolder[]>([]);
    const [media, setMedia] = useState<PickerMedia[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Ordered selection — tap order becomes slide/clip order. Entries carry the
    // full record so a pick survives navigating to another folder, and so
    // onConfirmDetailed can report kind + filename.
    const [selected, setSelected] = useState<PickedMedia[]>([]);
    const [confirming, setConfirming] = useState(false);

    const loadFolders = useCallback(async () => {
        setLoading(true);
        try {
            const json = await apiGet('/api/admin/studio/folders');
            setFolders(json.folders || []);
            setError(null);
        } catch (e: any) {
            setError(e?.message || 'Could not load folders');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadMedia = useCallback(async (folderId: string) => {
        setLoading(true);
        setMedia([]);
        try {
            const json = await apiGet(`/api/admin/studio/media?folderId=${encodeURIComponent(folderId)}`);
            setMedia(json.media || []);
            setError(null);
        } catch (e: any) {
            setError(e?.message || 'Could not load media');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (folder) loadMedia(folder.id);
        else loadFolders();
        // Run once for the initial view; navigation calls the loaders directly.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Escape closes (unless a confirm is mid-flight).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !confirming) onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, confirming]);

    function openFolder(f: PickerFolder) {
        setFolder({ id: f.id, name: f.name });
        loadMedia(f.id);
    }

    function backToFolders() {
        setFolder(null);
        setMedia([]);
        loadFolders();
    }

    function toggle(m: PickerMedia) {
        if (!isSelectable(m.kind, kinds) || confirming) return;
        setSelected(prev => (prev.some(s => s.id === m.id)
            ? prev.filter(s => s.id !== m.id)
            : [...prev, m]));
    }

    async function runConfirm(handler: 'primary' | 'secondary') {
        if (!selected.length || confirming) return;
        setConfirming(true);
        setError(null);
        try {
            if (handler === 'secondary') {
                await onConfirmSecondary?.(selected);
            } else if (onConfirmDetailed) {
                await onConfirmDetailed(selected);
            } else {
                await onConfirm?.(selected.map(s => s.url));
            }
            // On success the caller unmounts the modal; if it doesn't, stop
            // showing the spinner so the button is usable again.
            setConfirming(false);
        } catch (e: any) {
            setError(e?.message || `Could not use the selected ${kindNoun(kinds, true)}`);
            setConfirming(false);
        }
    }

    const selectableCount = media.filter(m => isSelectable(m.kind, kinds)).length;

    return (
        <div
            className="ak-modal__scrim"
            onClick={(e) => { if (e.target === e.currentTarget && !confirming) onClose(); }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            <div className="ak-modal" style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', maxHeight: 'min(80vh, 720px)' }}>
                {/* ── Header: title / current folder + close ── */}
                <div className="ak-modal__head" style={{ gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                        {folder ? (
                            <>
                                <button
                                    className="ak-btn ak-btn--ghost ak-btn--sm"
                                    onClick={backToFolders}
                                    disabled={confirming}
                                    type="button"
                                >
                                    <ArrowLeft size={14} /> All folders
                                </button>
                                <Folder size={15} strokeWidth={1.9} />
                                <span className="ak-vhub-title" style={{ fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {folder.name}
                                </span>
                            </>
                        ) : (
                            <span className="ak-vhub-title" style={{ fontSize: 15 }}>{title}</span>
                        )}
                    </div>
                    <button
                        className="ak-btn ak-btn--ghost ak-btn--sm"
                        onClick={onClose}
                        disabled={confirming}
                        aria-label="Close"
                        title="Close"
                        type="button"
                    >
                        <X size={15} />
                    </button>
                </div>

                {/* ── Body: folder grid OR image grid ── */}
                <div className="ak-modal__body" style={{ overflowY: 'auto', flex: 1, minHeight: 180 }}>
                    {error && <div className="ak-auth__err" style={{ marginBottom: 12 }}>{error}</div>}

                    {loading ? (
                        <div className="ak-empty" style={{ padding: '36px 0' }}>
                            <p className="ak-body-sm">Loading…</p>
                        </div>
                    ) : !folder ? (
                        folders.length === 0 ? (
                            <div className="ak-empty" style={{ padding: '36px 0' }}>
                                <span className="ak-empty__glyph" aria-hidden="true">雲</span>
                                <p className="ak-body-sm">No folders yet. Add pictures in Studio → Media first.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                                {folders.map((f) => (
                                    <button
                                        key={f.id}
                                        type="button"
                                        className="ak-vhub-card"
                                        onClick={() => openFolder(f)}
                                        disabled={confirming}
                                        style={{ cursor: 'pointer', textAlign: 'left', padding: 0 }}
                                        title={`Open ${f.name}`}
                                    >
                                        <div className="ak-vhub-thumb">
                                            {f.cover ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={f.cover} alt="" loading="lazy" crossOrigin="anonymous" />
                                            ) : (
                                                <span className="ak-vhub-thumb__fallback"><Folder size={22} /></span>
                                            )}
                                        </div>
                                        <div className="ak-vhub-meta">
                                            <div className="ak-vhub-title" style={{ fontSize: 12 }}>{f.name}</div>
                                            <span className="ak-caption">{f.count} item{f.count === 1 ? '' : 's'}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )
                    ) : media.length === 0 ? (
                        <div className="ak-empty" style={{ padding: '36px 0' }}>
                            <span className="ak-empty__glyph" aria-hidden="true">雲</span>
                            <p className="ak-body-sm">This folder is empty. Upload pictures to it in Studio → Media.</p>
                        </div>
                    ) : (
                        <>
                            {selectableCount === 0 && (
                                <p className="ak-caption" style={{ marginBottom: 10 }}>
                                    {kinds.includes('video')
                                        ? 'Nothing selectable in this folder.'
                                        : 'Only videos here — carousel slides need pictures, so nothing is selectable.'}
                                </p>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
                                {media.map((m) => {
                                    const isImage = m.kind === 'image';
                                    const selectable = isSelectable(m.kind, kinds);
                                    const pos = selected.findIndex(s => s.id === m.id);
                                    const picked = pos >= 0;
                                    return (
                                        <button
                                            key={m.id}
                                            type="button"
                                            onClick={() => toggle(m)}
                                            disabled={!selectable || confirming}
                                            aria-pressed={picked}
                                            title={selectable
                                                ? (picked ? `Selected #${pos + 1} — tap to unselect` : (m.filename || `Select ${kindNoun(kinds, false)}`))
                                                : 'Videos can’t be carousel slides'}
                                            style={{
                                                position: 'relative',
                                                aspectRatio: '4 / 5',
                                                borderRadius: 10,
                                                overflow: 'hidden',
                                                border: picked ? '2px solid var(--accent, #9D7BFF)' : '1px solid var(--line-2)',
                                                boxShadow: picked ? '0 0 0 2px rgba(157,123,255,0.25)' : 'none',
                                                background: 'var(--surface-2)',
                                                opacity: selectable ? 1 : 0.45,
                                                cursor: selectable && !confirming ? 'pointer' : 'not-allowed',
                                                padding: 0,
                                            }}
                                        >
                                            {isImage ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={m.url}
                                                    alt={m.filename || ''}
                                                    loading="lazy"
                                                    draggable={false}
                                                    crossOrigin="anonymous"
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                                />
                                            ) : (
                                                <>
                                                    {/* metadata-only load shows the poster frame */}
                                                    <video src={m.url} muted playsInline preload="metadata" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    <span
                                                        style={{
                                                            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                                                            justifyContent: 'center', color: '#fff', background: 'rgba(10,23,48,0.35)',
                                                        }}
                                                    >
                                                        <Play size={16} fill="currentColor" />
                                                    </span>
                                                    <span
                                                        className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider"
                                                        style={{ position: 'absolute', bottom: 4, left: 4, background: 'rgba(10,23,48,0.7)', color: '#fff' }}
                                                    >
                                                        Video
                                                    </span>
                                                </>
                                            )}
                                            {/* Selection badge — check + pick order (= slide/clip order).
                                                Gated on `selectable`, NOT on isImage: a picked video with
                                                no order number would break the ordering affordance that
                                                sequence-building depends on. */}
                                            {selectable && (
                                                <span
                                                    aria-hidden
                                                    style={{
                                                        position: 'absolute',
                                                        top: 5,
                                                        right: 5,
                                                        minWidth: 20,
                                                        height: 20,
                                                        padding: '0 4px',
                                                        borderRadius: 10,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        gap: 2,
                                                        fontSize: 10,
                                                        fontWeight: 700,
                                                        background: picked ? '#9D7BFF' : 'rgba(10,23,48,0.45)',
                                                        color: '#fff',
                                                        border: picked ? 'none' : '1px solid rgba(255,255,255,0.6)',
                                                    }}
                                                >
                                                    {picked ? <><Check size={11} strokeWidth={3} />{pos + 1}</> : ''}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                {/* ── Footer: running count + confirm ── */}
                <div className="ak-modal__foot" style={{ alignItems: 'center' }}>
                    <span className="ak-caption" style={{ marginRight: 'auto' }}>
                        {selected.length === 0
                            ? `Tap ${kindNoun(kinds, true)} to select — the order you pick is the order they're added.`
                            : `${selected.length} ${kindNoun(kinds, selected.length !== 1)} selected`}
                    </span>
                    <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={onClose} disabled={confirming} type="button">
                        Cancel
                    </button>
                    {secondaryLabel && onConfirmSecondary && (
                        <button
                            className="ak-btn ak-btn--secondary ak-btn--sm"
                            onClick={() => runConfirm('secondary')}
                            disabled={selected.length < 1 || confirming}
                            type="button"
                        >
                            {secondaryLabel(selected.length)}
                        </button>
                    )}
                    <button
                        className="ak-btn ak-btn--primary ak-btn--sm"
                        onClick={() => runConfirm('primary')}
                        disabled={selected.length < 1 || confirming}
                        type="button"
                    >
                        {confirming && <Loader2 size={14} className="animate-spin" />}
                        {confirmLabel(selected.length)}
                    </button>
                </div>
            </div>
        </div>
    );
}
