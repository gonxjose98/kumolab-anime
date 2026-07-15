'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Image as ImageIcon, Pencil, Library, Upload } from 'lucide-react';
import ImportFromUrlButton from '@/components/admin/dashboard/ImportFromUrlButton';

export interface ImageRow {
    id: string;
    title: string;
    status: string | null;
    image: string | null;
    timestamp?: string | null;
    editedAt?: string | null;
    edited: boolean;
}

const STATUS_CLASS: Record<string, string> = {
    pending: 'ak-badge--pending', draft: 'ak-badge--draft', approved: 'ak-badge--scheduled', published: 'ak-badge--published', declined: 'ak-badge--error',
};
const STATUS_LABEL: Record<string, string> = {
    pending: 'Pending', draft: 'Draft', approved: 'Scheduled', published: 'Published', declined: 'Declined',
};

function timeAgo(iso?: string | null): string {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 3_600_000) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
}

/** Studio > Images workbench — drafts + recently-edited image work as cards. */
export default function ImageHub({ rows }: { rows: ImageRow[]; kind?: 'videos' | 'images' }) {
    const router = useRouter();
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    // dragenter/dragleave fire for every child; a depth counter keeps the
    // highlight stable while the file moves across the hub body.
    const dragDepth = useRef(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fresh-photo flow: upload the picture(s) to the existing editor-uploads
    // staging (same endpoint the post editor uses), create ONE clean draft
    // around the returned URL(s), and open its editor. Selecting/dropping
    // several photos builds a carousel draft — one slide per picture, in
    // the order they were picked; a single photo keeps the classic
    // single-image draft.
    async function startFromPhotos(files: File[]) {
        if (uploading) return;
        const imgs = files.filter(f => f.type.startsWith('image/'));
        if (!imgs.length) {
            setUploadError('Only image files can be uploaded here.');
            return;
        }
        setUploading(true);
        setUploadError(null);
        try {
            const urls: string[] = [];
            for (const file of imgs) {
                const fd = new FormData();
                fd.append('file', file);
                const upRes = await fetch('/api/admin/upload-image', {
                    method: 'POST',
                    credentials: 'same-origin',
                    body: fd,
                });
                const upJson = await upRes.json().catch(() => ({}));
                if (!upRes.ok || upJson.success === false || !upJson.url) {
                    throw new Error(upJson.error || `Upload failed (HTTP ${upRes.status})`);
                }
                urls.push(upJson.url);
            }

            const draftRes = await fetch('/api/admin/studio/new-image-post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ urls }),
            });
            const draftJson = await draftRes.json().catch(() => ({}));
            if (!draftRes.ok || draftJson.success === false || !draftJson.id) {
                throw new Error(draftJson.error || `Could not create draft (HTTP ${draftRes.status})`);
            }

            router.push(`/admin/post/${draftJson.id}`);
            router.refresh();
        } catch (e: any) {
            setUploadError(e?.message || 'Upload failed');
            setUploading(false);
        }
    }

    function onDrop(e: React.DragEvent) {
        e.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith('image/'));
        if (files.length) startFromPhotos(files);
        else if (e.dataTransfer.files?.length) setUploadError('Only image files can be dropped here.');
    }

    return (
        <div
            className="max-w-6xl mx-auto"
            onDragEnter={(e) => {
                if (!e.dataTransfer.types.includes('Files')) return;
                e.preventDefault();
                dragDepth.current += 1;
                setDragOver(true);
            }}
            onDragOver={(e) => {
                if (!e.dataTransfer.types.includes('Files')) return;
                e.preventDefault();
            }}
            onDragLeave={() => {
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (dragDepth.current === 0) setDragOver(false);
            }}
            onDrop={onDrop}
        >
            <div className="ak-studio-head">
                <p className="ak-caption">
                    {rows.length === 0 ? 'Nothing in progress' : `${rows.length} in progress · drafts + recently edited`}
                </p>
                <div className="flex items-center gap-2">
                    {/* Upload photo: <input type=file accept=image/*> offers the
                        phone gallery/camera on mobile; on desktop it opens the
                        file picker (drag-and-drop onto the hub also works). */}
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="ak-btn ak-btn--primary ak-btn--sm"
                    >
                        <Upload size={13} /> {uploading ? 'Uploading…' : 'Upload photo'}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={uploading}
                        onChange={(e) => {
                            const fs = Array.from(e.target.files || []);
                            if (fs.length) startFromPhotos(fs);
                            e.target.value = '';
                        }}
                        className="hidden"
                    />
                    <ImportFromUrlButton />
                    <Link href="/admin/studio/library" className="ak-btn ak-btn--secondary ak-btn--sm">
                        <Library size={14} /> Library
                    </Link>
                </div>
            </div>

            {uploadError && <div className="ak-auth__err" style={{ textAlign: 'left', marginBottom: 12 }}>{uploadError}</div>}

            {rows.length === 0 ? (
                <div
                    className="ak-empty"
                    style={dragOver ? { outline: '2px dashed #9D7BFF', outlineOffset: -2, background: 'rgba(157,123,255,0.06)' } : undefined}
                >
                    <span className="ak-empty__glyph" aria-hidden="true"><ImageIcon size={34} /></span>
                    <p className="ak-body-sm">
                        {dragOver
                            ? <strong>Drop your photo(s) to start editing</strong>
                            : <>No image work in progress. <strong>Upload photo</strong> (or drag pictures anywhere onto this page) to start from a fresh photo — pick several at once to start a carousel — or open a piece from the <strong>Library</strong> to edit its card, overlays &amp; caption.</>}
                    </p>
                    <div className="flex items-center justify-center gap-2" style={{ marginTop: 14 }}>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className="ak-btn ak-btn--primary ak-btn--sm"
                        >
                            <Upload size={14} /> {uploading ? 'Uploading…' : 'Upload photo'}
                        </button>
                        <Link href="/admin/studio/library" className="ak-btn ak-btn--secondary ak-btn--sm">
                            <Library size={14} /> Browse Library
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="relative">
                    {dragOver && (
                        <div
                            className="absolute inset-0 z-10 flex items-center justify-center rounded-xl pointer-events-none"
                            style={{ outline: '2px dashed #9D7BFF', outlineOffset: -2, background: 'rgba(157,123,255,0.10)', backdropFilter: 'blur(2px)' }}
                        >
                            <span className="ak-body-sm" style={{ fontWeight: 700 }}>Drop your photo to start editing</span>
                        </div>
                    )}
                    <div className="ak-vhub-grid">
                        {rows.map((v) => (
                            <button key={v.id} className="ak-vhub-card" onClick={() => router.push(`/admin/post/${v.id}`)}>
                                <div className="ak-vhub-thumb">
                                    {v.image ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={v.image} alt="" />
                                    ) : (
                                        <span className="ak-vhub-thumb__fallback"><ImageIcon size={26} /></span>
                                    )}
                                    <span className="ak-vhub-play"><Pencil size={15} /></span>
                                    {v.edited && <span className="ak-vhub-edited"><Pencil size={10} /> Edited</span>}
                                </div>
                                <div className="ak-vhub-meta">
                                    <div className="ak-vhub-title">{v.title}</div>
                                    <div className="ak-vhub-row">
                                        {v.status && <span className={`ak-badge ${STATUS_CLASS[v.status] || 'ak-badge--draft'}`}>{STATUS_LABEL[v.status] || v.status}</span>}
                                        <span className="ak-caption">{v.editedAt ? `edited ${timeAgo(v.editedAt)}` : timeAgo(v.timestamp)}</span>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
