'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Play, Pause, Undo2, Redo2, Download, Loader2 } from 'lucide-react';
import { useProjectStore } from './store/projectStore';
import { usePlaybackStore } from './store/playbackStore';
import { useMediaStore } from './store/mediaStore';
import { probeMedia } from './store/blobStore';
import { addAssetToTimeline } from './clipFactory';
import { emptyProject, uid, type MediaAsset, type VideoProject } from './types';
import MediaLibrary from './MediaLibrary';
import PreviewCanvas from './PreviewCanvas';
import Timeline from './Timeline';
import Inspector from './Inspector';
import ExportDialog from './ExportDialog';
import './studio.css';

export default function StudioApp({ postId }: { postId: string }) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [postTitle, setPostTitle] = useState('');
    const project = useProjectStore((s) => s.project);
    const isPlaying = usePlaybackStore((s) => s.isPlaying);
    const savedRef = useRef<string>('');
    const [exportOpen, setExportOpen] = useState(false);

    // Load the post → build or restore the project.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/posts?id=${encodeURIComponent(postId)}`, { cache: 'no-store', credentials: 'same-origin' });
                if (!res.ok) throw new Error(`Failed to load post (HTTP ${res.status})`);
                const post = await res.json();
                if (cancelled) return;
                setPostTitle(post.title || 'Untitled');

                const existing: VideoProject | undefined = post.image_settings?.video_project;
                if (existing && existing.tracks) {
                    useProjectStore.getState().load(existing);
                } else {
                    useProjectStore.getState().load(emptyProject(postId));
                    const srcUrl: string | undefined = post.social_ids?.original_video_url || post.social_ids?.staged_video_url;
                    if (srcUrl) {
                        const id = uid();
                        let probe = { durationSec: 0, width: 0, height: 0, hasAudio: true };
                        try { probe = await probeMedia(srcUrl, 'video'); } catch { /* keep defaults */ }
                        if (cancelled) return;
                        const asset: MediaAsset = {
                            id, kind: 'video', name: 'Original clip', origin: 'post-original',
                            remoteUrl: srcUrl, durationSec: probe.durationSec, width: probe.width,
                            height: probe.height, hasAudio: probe.hasAudio, createdAt: Date.now(),
                        };
                        useProjectStore.getState().addMedia(asset);
                        addAssetToTimeline(asset);
                    }
                }
                savedRef.current = JSON.stringify(useProjectStore.getState().project);
            } catch (e: any) {
                if (!cancelled) setError(e?.message || 'Failed to open studio');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; useMediaStore.getState().revokeAll(); };
    }, [postId]);

    // Debounced autosave of the project JSON (re-editability).
    useEffect(() => {
        if (!project) return;
        const snap = JSON.stringify(project);
        if (snap === savedRef.current) return;
        const t = setTimeout(async () => {
            try {
                await fetch('/api/admin/studio/save-project', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ postId, project }),
                });
                savedRef.current = snap;
            } catch { /* autosave is best-effort */ }
        }, 1200);
        return () => clearTimeout(t);
    }, [project, postId]);

    // Expose stores for debugging / automated verification (dev only).
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production') {
            (window as any).__studio = { project: useProjectStore, playback: usePlaybackStore, media: useMediaStore };
        }
    }, []);

    // Keyboard: space = play/pause, delete = remove selection.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (e.code === 'Space') { e.preventDefault(); usePlaybackStore.getState().toggle(); }
            else if (e.key === 'Delete' || e.key === 'Backspace') {
                const sel = useProjectStore.getState().selectedClipIds;
                sel.forEach((id) => useProjectStore.getState().removeClip(id));
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) useProjectStore.getState().redo(); else useProjectStore.getState().undo();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    if (error) {
        return (
            <div className="st-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="ak-empty">
                    <p className="ak-body-sm" style={{ color: 'var(--sun)' }}>{error}</p>
                    <button className="ak-btn ak-btn--secondary" onClick={() => router.push(`/admin/post/${postId}`)}>Back to post</button>
                </div>
            </div>
        );
    }

    return (
        <div className="st-root">
            <div className="st-topbar">
                <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={() => router.push(`/admin/post/${postId}`)}>
                    <ArrowLeft size={15} /> Back
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/kumolab-cloud-mark-gold.png" alt="" className="st-topbar__logo" />
                <div>
                    <div className="st-topbar__title">KumoLab Studio</div>
                    <div className="st-topbar__sub">{loading ? 'Loading…' : postTitle}</div>
                </div>
                <div className="st-spacer" />
                <button className="ak-btn ak-btn--ghost ak-btn--sm" title="Undo" onClick={() => useProjectStore.getState().undo()}><Undo2 size={15} /></button>
                <button className="ak-btn ak-btn--ghost ak-btn--sm" title="Redo" onClick={() => useProjectStore.getState().redo()}><Redo2 size={15} /></button>
                <button className="ak-btn ak-btn--primary" onClick={() => setExportOpen(true)} disabled={loading || !project?.durationSec}>
                    <Download size={15} /> Export
                </button>
            </div>

            {exportOpen && <ExportDialog postId={postId} onClose={() => setExportOpen(false)} onDone={() => { /* stays open to show success */ }} />}

            {loading ? (
                <div style={{ gridArea: 'preview', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c9d6ea' }}>
                    <Loader2 className="animate-spin" size={22} />
                </div>
            ) : (
                <>
                    <MediaLibrary />
                    <div className="st-preview">
                        <PreviewCanvas />
                        <div className="st-transport">
                            <button onClick={() => usePlaybackStore.getState().toggle()} aria-label={isPlaying ? 'Pause' : 'Play'}>
                                {isPlaying ? <Pause size={16} /> : <Play size={16} style={{ marginLeft: 2 }} />}
                            </button>
                        </div>
                    </div>
                    <Inspector />
                    <Timeline />
                </>
            )}
        </div>
    );
}
