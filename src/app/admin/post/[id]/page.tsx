'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface XY { x: number; y: number }

interface Settings {
    applyText: boolean;
    applyGradient: boolean;
    applyWatermark: boolean;
    gradientPosition: 'top' | 'bottom';
    gradientStrength: number;           // 1 = default; <1 softer, >1 harder
    titleScale: number;
    captionScale: number;
    titleOffset: XY;
    captionOffset: XY;
    watermarkPosition: XY | null;       // null = renderer's auto bottom-center
    purpleWordIndices: number[];        // indices into the merged title+caption word stream
}

// All overlays default OFF when opening the editor. The user opts in to
// each treatment by toggling ON. This is per Jose's directive: nothing
// should appear unless explicitly enabled.
//
// Default scales: title 100%, caption 55% — caption smaller than title by
// default but still readable, not obnoxious.
const DEFAULT_SETTINGS: Settings = {
    applyText: false,
    applyGradient: false,
    applyWatermark: false,
    gradientPosition: 'bottom',
    gradientStrength: 1,
    titleScale: 1,
    captionScale: 0.55,
    titleOffset: { x: 0, y: 0 },
    captionOffset: { x: 0, y: 0 },
    watermarkPosition: null,
    purpleWordIndices: [],
};

// Smaller per-click nudge — 12px gives finer placement without feeling
// laggy. Earlier 30px was overshooting.
const NUDGE_PX = 12;
const KUMOLAB_PURPLE = '#9D7BFF';
const CANVAS_W = 1080;
const CANVAS_H = 1350;

export default function PostEditor() {
    const params = useParams();
    const id = params?.id as string;
    const router = useRouter();

    const [post, setPost] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<null | 'save' | 'render' | 'approve' | 'decline' | 'delete'>(null);
    const [error, setError] = useState<string | null>(null);
    const [imageError, setImageError] = useState<string | null>(null);

    // Editable fields
    const [title, setTitle] = useState('');
    const [excerpt, setExcerpt] = useState('');
    const [content, setContent] = useState('');
    const [sourceUrl, setSourceUrl] = useState('');
    const [imageUrl, setImageUrl] = useState('');

    // Image overlay toggles — session-local, sent on each render call.
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

    // Live-render plumbing: when a toggle changes (or title/caption is
    // edited and committed), debounce-fire a render so the preview reflects
    // the change without making the user hunt for the Regenerate button.
    const liveRenderTimer = useRef<NodeJS.Timeout | null>(null);
    const initialLoadDone = useRef(false);
    // The last preview render's base64 bytes. On Save we send these back to
    // the server so what publishes is byte-for-byte what the user just saw,
    // not a fresh render that might drift.
    const lastPreviewBytes = useRef<string | null>(null);

    // The post + post mutation paths go through /api/posts because RLS is
    // service-role-only — a direct anon-key client read returns zero rows
    // (PostgREST throws "Cannot coerce the result to a single JSON object"
    // on .single()). The middleware admin-auths /api/posts mutations and
    // checks the Supabase session for /api/posts GET.

    useEffect(() => {
        async function load() {
            try {
                const res = await fetch(`/api/posts?id=${encodeURIComponent(id)}`, { cache: 'no-store', credentials: 'same-origin' });
                if (!res.ok) {
                    const j = await res.json().catch(() => ({}));
                    throw new Error(j.error || `Failed to load post (HTTP ${res.status})`);
                }
                const data = await res.json();
                setPost(data);
                setTitle(data.title || '');
                setExcerpt(data.excerpt || '');
                setContent(data.content || '');
                // DO NOT pre-fill sourceUrl from data.source_url — that field
                // is the article/YouTube watch URL, NOT a renderable image.
                // Pre-filling it caused the renderer to fetch youtube.com/
                // watch?v=… as binary, which fails. Leave blank so the
                // renderer falls back to post.image (the actual thumbnail).
                // If this post has a previously-approved settings snapshot,
                // hydrate the editor state from it. That way reopening a
                // published post shows the EXACT toggles + scales + nudges
                // + word-color choices you approved with — no guessing.
                if (data.image_settings && typeof data.image_settings === 'object') {
                    const s = data.image_settings as any;
                    setSettings(prev => ({
                        ...prev,
                        applyText: s.applyText ?? prev.applyText,
                        applyGradient: s.applyGradient ?? prev.applyGradient,
                        applyWatermark: s.applyWatermark ?? prev.applyWatermark,
                        gradientPosition: s.gradientPosition ?? prev.gradientPosition,
                        gradientStrength: s.gradientStrength ?? prev.gradientStrength,
                        titleScale: s.titleScale ?? prev.titleScale,
                        captionScale: s.captionScale ?? prev.captionScale,
                        titleOffset: s.titleOffset ?? prev.titleOffset,
                        captionOffset: s.captionOffset ?? prev.captionOffset,
                        watermarkPosition: s.watermarkPosition ?? prev.watermarkPosition,
                        purpleWordIndices: s.purpleWordIndices ?? prev.purpleWordIndices,
                    }));
                    if (s.sourceUrl && typeof s.sourceUrl === 'string') {
                        setSourceUrl(s.sourceUrl);
                    } else {
                        setSourceUrl('');
                    }
                } else {
                    setSourceUrl('');
                }
                setImageUrl(data.image || '');
                // Fire a preview render immediately with the default toggle
                // state (all OFF). This makes the displayed image actually
                // match the toggle UI on open — without it, the editor was
                // showing whatever was last persisted to post.image (which
                // for posts touched by the pre-fix editor still has overlays
                // baked in). Render-on-open also makes Force Regenerate's
                // result feel meaningful — the displayed image is now
                // demonstrably "what these settings produce right now."
                kickPreview(data);
                initialLoadDone.current = true;
            } catch (e: any) {
                setError(e?.message || 'Post not found');
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [id]);

    // Live-render: re-run the renderer ~1.2s after the user changes any
    // toggle, scale, position, or purple selection. Cancels prior timer on
    // each change so rapid clicks coalesce into a single render at the end.
    useEffect(() => {
        if (!initialLoadDone.current) return;
        if (liveRenderTimer.current) clearTimeout(liveRenderTimer.current);
        liveRenderTimer.current = setTimeout(() => {
            handleRegenerate({ silent: true });
        }, 1200);
        return () => {
            if (liveRenderTimer.current) clearTimeout(liveRenderTimer.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        settings.applyText, settings.applyGradient, settings.applyWatermark,
        settings.gradientPosition, settings.gradientStrength,
        settings.titleScale, settings.captionScale,
        settings.titleOffset.x, settings.titleOffset.y,
        settings.captionOffset.x, settings.captionOffset.y,
        settings.watermarkPosition?.x, settings.watermarkPosition?.y,
        // Reference the JSON so any change to the array triggers re-render.
        JSON.stringify(settings.purpleWordIndices),
    ]);

    // Preview-render helper that doesn't depend on the title/excerpt useState
    // values (avoids the "stale state" race when called from inside the
    // post-load effect). Pass the just-loaded post in directly.
    async function kickPreview(loadedPost: any) {
        try {
            const res = await fetch('/api/admin/render-post-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    postId: loadedPost.id,
                    title: loadedPost.title || '',
                    excerpt: loadedPost.excerpt || '',
                    settings: DEFAULT_SETTINGS,
                    persist: false,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (json?.success && json.image) setImageUrl(json.image);
        } catch {
            // Soft fail — leave imageUrl as-is and let the user toggle to retry.
        }
    }

    async function callJson(url: string, body: any): Promise<any> {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) {
            throw new Error(json.error || `Request failed (${res.status})`);
        }
        return json;
    }

    async function handleSave(opts: { thenApprove?: boolean } = {}) {
        // What you see is what publishes. We send the exact base64 bytes
        // the preview just rendered — the server uploads them as-is, no
        // second render. The settings snapshot still gets persisted so a
        // future emergency re-render (cleanup recovery, etc.) can
        // reproduce the same picture if the bytes ever go missing.
        //
        // If lastPreviewBytes is empty (user hit Save before any preview
        // ran) we fall back to a server-side render with persist=true
        // using current settings. That path produces the same output as
        // the auto-render would have.
        const action = opts.thenApprove ? 'approve' : 'save';
        setBusy(action);
        setError(null);
        try {
            const renderJson = await callJson('/api/admin/render-post-image', {
                postId: id,
                sourceUrl: sourceUrl || undefined,
                title,
                excerpt,
                settings,
                persist: true,
                previewImage: lastPreviewBytes.current || undefined,
            });

            const res = await fetch('/api/posts', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ id, title, excerpt, content, image: renderJson.image }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) {
                throw new Error(json.error || `Save failed (HTTP ${res.status})`);
            }

            if (opts.thenApprove) {
                await callJson('/api/admin/approve', { postIds: [id] });
            }

            router.push('/admin/dashboard');
            router.refresh();
        } catch (e: any) {
            setError(e?.message || 'Save failed');
            setBusy(null);
        }
    }

    function handleCancel() {
        // Discard everything — no DB writes, no render persistence. The
        // post remains exactly as it was when the editor opened.
        router.push('/admin/dashboard');
    }

    async function handleRegenerate(opts: { silent?: boolean } = {}) {
        // Preview-only render. Returns a base64 data URL we display in the
        // <img> tag. Nothing is written to Storage or the DB until the
        // user hits Save. This means the user can experiment freely with
        // toggles, scales, nudges, and word colors and walk away (or hit
        // Cancel) without leaving any trace on the post.
        setBusy('render');
        if (!opts.silent) setError(null);
        setImageError(null);
        try {
            const json = await callJson('/api/admin/render-post-image', {
                postId: id,
                sourceUrl: sourceUrl || undefined,
                title,
                excerpt,
                settings,
                persist: false,
            });
            setImageUrl(json.image); // base64 data URL — no cache-bust needed
            // Cache the bytes so Save can promote THIS exact render —
            // what the user is looking at right now becomes the published
            // image with no second render.
            if (typeof json.image === 'string' && json.image.startsWith('data:image/')) {
                lastPreviewBytes.current = json.image;
            }
        } catch (e: any) {
            setError(e?.message || 'Render failed');
        } finally {
            setBusy(null);
        }
    }

    async function handleReset() {
        setBusy('render');
        setError(null);
        setImageError(null);
        try {
            const json = await callJson('/api/admin/reset-image', { postId: id });
            // Setting sourceUrl tells the render endpoint to use this URL as
            // the preview source, bypassing post.image (which may be baked).
            setSourceUrl(json.url);
            // Fire a preview render off the fresh source.
            const r = await callJson('/api/admin/render-post-image', {
                postId: id,
                sourceUrl: json.url,
                title,
                excerpt,
                settings,
                persist: false,
            });
            setImageUrl(r.image);
        } catch (e: any) {
            setError(e?.message || 'Reset failed');
        } finally {
            setBusy(null);
        }
    }

    async function handleUpload(file: File) {
        setBusy('render');
        setError(null);
        setImageError(null);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('/api/admin/upload-image', {
                method: 'POST',
                credentials: 'same-origin',
                body: fd,
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) {
                throw new Error(json.error || `Upload failed (HTTP ${res.status})`);
            }
            // Use the uploaded URL as the render source for the next render.
            setSourceUrl(json.url);
            // Kick a render immediately so the user sees the uploaded
            // image swap into the preview without manual regenerate.
            await handleRegenerate({ silent: true });
        } catch (e: any) {
            setError(e?.message || 'Upload failed');
        } finally {
            setBusy(null);
        }
    }

    async function handleDecline() {
        if (!confirm('Decline this post? It will be removed and added to the dedup memory.')) return;
        setBusy('decline');
        try {
            await callJson('/api/admin/decline', { postIds: [id] });
            router.push('/admin/dashboard');
            router.refresh();
        } catch (e: any) {
            setError(e?.message || 'Decline failed');
            setBusy(null);
        }
    }

    async function handleDelete() {
        if (!confirm('Permanently delete this post? Cannot be undone.')) return;
        setBusy('delete');
        try {
            const res = await fetch(`/api/posts?id=${encodeURIComponent(id)}`, {
                method: 'DELETE',
                credentials: 'same-origin',
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) {
                throw new Error(json.error || `Delete failed (HTTP ${res.status})`);
            }
            router.push('/admin/dashboard');
            router.refresh();
        } catch (e: any) {
            setError(e?.message || 'Delete failed');
            setBusy(null);
        }
    }

    if (loading) {
        return (
            <div className="max-w-3xl mx-auto py-12 text-center">
                <div className="text-[10px] uppercase tracking-[0.3em] font-mono" style={{ color: 'var(--text-muted)' }}>
                    Loading editor…
                </div>
            </div>
        );
    }

    if (!post) {
        return (
            <div className="max-w-3xl mx-auto py-12 text-center">
                <div className="text-sm" style={{ color: '#ff7777' }}>{error || 'Post not found'}</div>
            </div>
        );
    }

    const isPending = post.status === 'pending';
    const claimLabel = (post.claim_type || 'OTHER').replace(/_/g, ' ');

    return (
        <div className="max-w-5xl mx-auto space-y-5">
            {/* Header strip */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                        Edit Post
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                        <StatusPill status={post.status} />
                        <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                            {claimLabel} · {post.source}
                        </span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleCancel}
                        disabled={!!busy}
                        className="px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all hover:bg-white/[0.05] disabled:opacity-40"
                        style={{
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.12)',
                            color: 'var(--text-tertiary)',
                            fontFamily: 'var(--font-display)',
                        }}
                    >
                        Cancel
                    </button>
                    {isPending && (
                        <button
                            onClick={() => handleSave({ thenApprove: true })}
                            disabled={!!busy}
                            className="px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5 disabled:opacity-40"
                            style={{
                                background: 'linear-gradient(135deg, rgba(0,255,136,0.20), rgba(0,212,170,0.12))',
                                border: '1px solid rgba(0,255,136,0.35)',
                                color: '#7af0a8',
                                fontFamily: 'var(--font-display)',
                            }}
                        >
                            {busy === 'approve' ? 'Approving…' : 'Save + Approve'}
                        </button>
                    )}
                    <button
                        onClick={() => handleSave()}
                        disabled={!!busy}
                        className="px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5 disabled:opacity-40"
                        style={{
                            background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(123,97,255,0.15))',
                            border: '1px solid rgba(123,97,255,0.30)',
                            color: '#fff',
                            fontFamily: 'var(--font-display)',
                        }}
                    >
                        {busy === 'save' ? 'Saving…' : 'Save'}
                    </button>
                </div>
            </div>

            {error && (
                <div
                    className="p-3 rounded-lg text-xs"
                    style={{ background: 'rgba(255,68,68,0.10)', border: '1px solid rgba(255,68,68,0.25)', color: '#ff9999' }}
                >
                    {error}
                </div>
            )}

            <div className="grid md:grid-cols-[1fr_360px] gap-5">
                {/* ── Image preview + render controls ─────────────── */}
                <Card>
                    <div className="aspect-[4/5] w-full relative" style={{ background: '#0a0a14' }}>
                        {imageUrl && !imageError ? (
                            <>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    key={imageUrl}
                                    src={imageUrl}
                                    alt={title}
                                    className="w-full h-full object-cover"
                                    onError={() => setImageError('Image failed to load — the source may be expired or blocked.')}
                                />
                                {busy === 'render' && (
                                    <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
                                        <span className="text-[10px] uppercase tracking-[0.3em] font-mono" style={{ color: '#7adfff' }}>
                                            Rendering…
                                        </span>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                                <span className="text-xs" style={{ color: '#ff9999' }}>
                                    {imageError || 'No image set yet.'}
                                </span>
                                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                    Set a source URL below and click Regenerate.
                                </span>
                            </div>
                        )}
                    </div>
                </Card>

                {/* ── Live overlay editor (text fields + toggles) ──── */}
                <div className="space-y-4">
                    <Card className="p-4 space-y-3">
                        <SectionLabel>Overlay text</SectionLabel>
                        <div>
                            <label className="block text-[9px] font-bold uppercase tracking-[0.2em] mb-1.5" style={{ color: 'var(--text-muted)' }}>
                                Title (big bold line)
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                onBlur={() => handleRegenerate({ silent: true })}
                                className="w-full bg-black/40 px-3 py-2 rounded-lg text-sm focus:outline-none"
                                style={{ border: '1px solid rgba(255,255,255,0.10)', color: 'var(--text-primary)' }}
                            />
                        </div>
                        <div>
                            <label className="block text-[9px] font-bold uppercase tracking-[0.2em] mb-1.5" style={{ color: 'var(--text-muted)' }}>
                                Caption (smaller line under title)
                            </label>
                            <input
                                type="text"
                                value={excerpt}
                                onChange={e => setExcerpt(e.target.value)}
                                onBlur={() => handleRegenerate({ silent: true })}
                                placeholder="Sharp, observational, KumoLab voice"
                                className="w-full bg-black/40 px-3 py-2 rounded-lg text-sm focus:outline-none"
                                style={{ border: '1px solid rgba(255,255,255,0.10)', color: 'var(--text-primary)' }}
                            />
                        </div>
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            Edits apply on blur · toggles + nudges apply instantly
                        </p>

                        {/* Purple-word picker — click any word to flip it to
                            KumoLab purple in the rendered overlay; click again
                            to clear. Picker only enables when Show text is on.
                            Words are indexed across the merged title+caption
                            stream (matches the renderer). */}
                        <PurpleWordPicker
                            disabled={!settings.applyText}
                            title={title}
                            caption={excerpt}
                            selected={settings.purpleWordIndices}
                            onChange={next => setSettings(s => ({ ...s, purpleWordIndices: next }))}
                        />
                    </Card>

                    <Card className="p-4">
                        <SectionLabel>Overlay toggles</SectionLabel>
                        <div className="space-y-2 mt-3">
                            <Toggle
                                label="Show text"
                                hint="Title overlay on the image"
                                value={settings.applyText}
                                onChange={v => setSettings(s => ({ ...s, applyText: v }))}
                            />
                            <Toggle
                                label="Show gradient"
                                hint="Dark fade behind the text"
                                value={settings.applyGradient}
                                onChange={v => setSettings(s => ({ ...s, applyGradient: v }))}
                            />
                            <Toggle
                                label="Show watermark"
                                hint="@KumoLabAnime mark"
                                value={settings.applyWatermark}
                                onChange={v => setSettings(s => ({ ...s, applyWatermark: v }))}
                            />

                            <div className="pt-2 border-t space-y-2.5" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                                <div>
                                    <div className="text-[9px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: 'var(--text-muted)' }}>
                                        Gradient position
                                    </div>
                                    <div className="flex gap-2">
                                        {(['bottom', 'top'] as const).map(pos => {
                                            const active = settings.gradientPosition === pos;
                                            return (
                                                <button
                                                    key={pos}
                                                    onClick={() => setSettings(s => ({ ...s, gradientPosition: pos }))}
                                                    className="flex-1 px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all"
                                                    style={{
                                                        background: active
                                                            ? 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(123,97,255,0.15))'
                                                            : 'rgba(255,255,255,0.03)',
                                                        border: `1px solid ${active ? 'rgba(123,97,255,0.30)' : 'rgba(255,255,255,0.06)'}`,
                                                        color: active ? '#fff' : 'var(--text-tertiary)',
                                                        fontFamily: 'var(--font-display)',
                                                    }}
                                                >
                                                    {pos}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div style={{ opacity: settings.applyGradient ? 1 : 0.4 }}>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
                                            Gradient strength
                                        </span>
                                        <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                            {settings.gradientStrength === 1 ? 'default' : `${Math.round(settings.gradientStrength * 100)}%`}
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min={0.3}
                                        max={1.5}
                                        step={0.05}
                                        value={settings.gradientStrength}
                                        disabled={!settings.applyGradient}
                                        onChange={e => setSettings(s => ({ ...s, gradientStrength: parseFloat(e.target.value) }))}
                                        className="w-full accent-purple-500"
                                    />
                                    <div className="flex justify-between text-[8px] uppercase tracking-wider mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                        <span>Soft</span>
                                        <span>Hard</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => handleRegenerate()}
                            disabled={!!busy}
                            className="w-full mt-4 px-4 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5 disabled:opacity-40"
                            style={{
                                background: 'linear-gradient(135deg, rgba(255,60,172,0.18), rgba(123,97,255,0.18))',
                                border: '1px solid rgba(255,60,172,0.30)',
                                color: '#fff',
                                fontFamily: 'var(--font-display)',
                            }}
                        >
                            {busy === 'render' ? 'Rendering…' : 'Force Regenerate'}
                        </button>
                    </Card>

                    {/* ── Layout: scale + position per element ─────────── */}
                    <Card className="p-4 space-y-4">
                        <SectionLabel>Layout</SectionLabel>

                        <ElementControls
                            label="Title"
                            disabled={!settings.applyText}
                            scale={settings.titleScale}
                            scaleMin={0.4}
                            scaleMax={1.6}
                            onScaleChange={v => setSettings(s => ({ ...s, titleScale: v }))}
                            offset={settings.titleOffset}
                            onNudge={(dx, dy) => setSettings(s => ({
                                ...s,
                                titleOffset: { x: s.titleOffset.x + dx, y: s.titleOffset.y + dy },
                            }))}
                            onRecenter={() => setSettings(s => ({ ...s, titleOffset: { x: 0, y: 0 } }))}
                        />

                        <ElementControls
                            label="Caption"
                            disabled={!settings.applyText}
                            scale={settings.captionScale}
                            scaleMin={0.25}
                            scaleMax={1.2}
                            onScaleChange={v => setSettings(s => ({ ...s, captionScale: v }))}
                            offset={settings.captionOffset}
                            onNudge={(dx, dy) => setSettings(s => ({
                                ...s,
                                captionOffset: { x: s.captionOffset.x + dx, y: s.captionOffset.y + dy },
                            }))}
                            onRecenter={() => setSettings(s => ({ ...s, captionOffset: { x: 0, y: 0 } }))}
                        />

                        {/* Watermark uses an absolute (x,y) — convert nudges
                            to absolute by snapping the first nudge off the
                            renderer default (centered, bottom). Recenter
                            clears back to null so renderer auto-positions. */}
                        <ElementControls
                            label="Watermark"
                            disabled={!settings.applyWatermark}
                            offset={settings.watermarkPosition
                                ? {
                                    x: settings.watermarkPosition.x - CANVAS_W / 2,
                                    y: settings.watermarkPosition.y - (CANVAS_H - 50),
                                }
                                : { x: 0, y: 0 }}
                            onNudge={(dx, dy) => setSettings(s => {
                                const base = s.watermarkPosition ?? { x: CANVAS_W / 2, y: CANVAS_H - 50 };
                                return { ...s, watermarkPosition: { x: base.x + dx, y: base.y + dy } };
                            })}
                            onRecenter={() => setSettings(s => ({ ...s, watermarkPosition: null }))}
                        />
                    </Card>

                    {isPending && (
                        <Card className="p-4">
                            <SectionLabel>Quick actions</SectionLabel>
                            <button
                                onClick={handleDecline}
                                disabled={!!busy}
                                className="w-full mt-3 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5 disabled:opacity-40"
                                style={{
                                    background: 'rgba(255,255,255,0.02)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    color: 'var(--text-tertiary)',
                                    fontFamily: 'var(--font-display)',
                                }}
                            >
                                {busy === 'decline' ? 'Declining…' : 'Decline & Remove'}
                            </button>
                        </Card>
                    )}

                    <Card className="p-4">
                        <button
                            onClick={handleDelete}
                            disabled={!!busy}
                            className="w-full px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all hover:bg-red-500/10 disabled:opacity-40"
                            style={{
                                background: 'transparent',
                                border: '1px solid rgba(255,68,68,0.20)',
                                color: '#ff7777',
                                fontFamily: 'var(--font-display)',
                            }}
                        >
                            {busy === 'delete' ? 'Deleting…' : 'Delete permanently'}
                        </button>
                    </Card>
                </div>
            </div>

            {/* ── Body + source URL (less visual; below the fold is fine) ── */}
            <Card className="p-5 space-y-4">
                <Field label="Background image" hint="Upload your own picture, paste a direct image URL, or hit Reset to fetch a fresh original (clears any baked-in overlay from prior renders). URL must be a direct image, not a YouTube watch page.">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                        <input
                            type="text"
                            value={sourceUrl}
                            onChange={e => setSourceUrl(e.target.value)}
                            placeholder="https://… (direct .jpg / .png / .webp)"
                            className="flex-1 bg-black/40 px-4 py-3 rounded-lg text-sm font-mono focus:outline-none"
                            style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}
                        />
                        <button
                            onClick={handleReset}
                            disabled={!!busy}
                            className="px-4 py-3 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5 disabled:opacity-40"
                            style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.10)',
                                color: 'var(--text-tertiary)',
                                fontFamily: 'var(--font-display)',
                            }}
                            title="Re-fetch a clean original image and discard any baked overlay"
                        >
                            Reset
                        </button>
                        <label
                            className="px-4 py-3 rounded-lg text-[11px] font-bold uppercase tracking-wider cursor-pointer text-center transition-all hover:-translate-y-0.5"
                            style={{
                                background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(123,97,255,0.15))',
                                border: '1px solid rgba(123,97,255,0.30)',
                                color: '#fff',
                                fontFamily: 'var(--font-display)',
                                opacity: busy ? 0.4 : 1,
                            }}
                        >
                            {busy === 'render' ? 'Working…' : 'Upload image'}
                            <input
                                type="file"
                                accept="image/*"
                                disabled={!!busy}
                                onChange={e => {
                                    const f = e.target.files?.[0];
                                    if (f) handleUpload(f);
                                    e.target.value = ''; // allow re-uploading the same file
                                }}
                                className="hidden"
                            />
                        </label>
                    </div>
                </Field>

                <Field label="Body content">
                    <textarea
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        rows={5}
                        className="w-full bg-black/40 px-4 py-3 rounded-lg text-sm focus:outline-none resize-none"
                        style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}
                    />
                </Field>
            </Card>
        </div>
    );
}

// ─── UI primitives ────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div
            className={`rounded-xl overflow-hidden ${className}`}
            style={{
                background: 'rgba(12, 12, 24, 0.55)',
                border: '1px solid rgba(255,255,255,0.06)',
                backdropFilter: 'blur(20px)',
            }}
        >
            {children}
        </div>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
            {children}
        </div>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.22em] mb-2" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
                {label}
            </label>
            {children}
            {hint && <p className="mt-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
        </div>
    );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!value)}
            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg transition-all hover:bg-white/[0.03]"
            style={{ background: 'transparent' }}
        >
            <div className="flex flex-col items-start">
                <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</span>
                {hint && <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{hint}</span>}
            </div>
            <span
                className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                style={{
                    background: value ? 'linear-gradient(135deg, #00d4ff, #7b61ff)' : 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.10)',
                }}
            >
                <span
                    className="absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all"
                    style={{
                        left: value ? '17px' : '2px',
                        background: '#fff',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                    }}
                />
            </span>
        </button>
    );
}

// Per-element scale slider + nudge pad. Used for Title, Caption, Watermark.
// scale fields are optional — Watermark doesn't have a scale knob today.
function ElementControls({
    label,
    disabled,
    scale,
    scaleMin,
    scaleMax,
    onScaleChange,
    offset,
    onNudge,
    onRecenter,
}: {
    label: string;
    disabled?: boolean;
    scale?: number;
    scaleMin?: number;
    scaleMax?: number;
    onScaleChange?: (v: number) => void;
    offset: XY;
    onNudge: (dx: number, dy: number) => void;
    onRecenter: () => void;
}) {
    const dim = disabled ? 0.4 : 1;
    return (
        <div className="space-y-2" style={{ opacity: dim }}>
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text-secondary)' }}>
                    {label}
                </span>
                <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    {offset.x === 0 && offset.y === 0
                        ? 'centered'
                        : `Δ ${offset.x >= 0 ? '+' : ''}${offset.x}, ${offset.y >= 0 ? '+' : ''}${offset.y}`}
                </span>
            </div>

            {scale !== undefined && onScaleChange && (
                <div className="flex items-center gap-2">
                    <input
                        type="range"
                        min={scaleMin ?? 0.4}
                        max={scaleMax ?? 1.6}
                        step={0.05}
                        value={scale}
                        disabled={disabled}
                        onChange={e => onScaleChange(parseFloat(e.target.value))}
                        className="flex-1 accent-purple-500"
                    />
                    <span className="text-[10px] font-mono w-10 text-right" style={{ color: 'var(--text-muted)' }}>
                        {Math.round(scale * 100)}%
                    </span>
                </div>
            )}

            <div className="flex items-center gap-1.5">
                <NudgeBtn disabled={disabled} onClick={() => onNudge(-NUDGE_PX, 0)}>←</NudgeBtn>
                <NudgeBtn disabled={disabled} onClick={() => onNudge(0, -NUDGE_PX)}>↑</NudgeBtn>
                <NudgeBtn disabled={disabled} onClick={() => onNudge(0, NUDGE_PX)}>↓</NudgeBtn>
                <NudgeBtn disabled={disabled} onClick={() => onNudge(NUDGE_PX, 0)}>→</NudgeBtn>
                <button
                    onClick={onRecenter}
                    disabled={disabled}
                    className="ml-auto px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all hover:bg-white/[0.05] disabled:cursor-not-allowed"
                    style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'var(--text-tertiary)',
                        fontFamily: 'var(--font-display)',
                    }}
                >
                    Recenter
                </button>
            </div>
        </div>
    );
}

function NudgeBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className="w-7 h-7 rounded text-xs font-bold transition-all hover:bg-white/[0.05] disabled:cursor-not-allowed"
            style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--text-primary)',
            }}
        >
            {children}
        </button>
    );
}

// Renders title words then caption words as a chip row. Click toggles each
// word's index in the global purpleWordIndices array (which the renderer
// indexes the same way: title words first, then caption words).
function PurpleWordPicker({
    disabled,
    title,
    caption,
    selected,
    onChange,
}: {
    disabled?: boolean;
    title: string;
    caption: string;
    selected: number[];
    onChange: (next: number[]) => void;
}) {
    // Match the renderer's normalization: ALL CAPS so what the picker shows
    // matches what the rendered overlay shows.
    const titleWords = (title || '').toUpperCase().trim().split(/\s+/).filter(Boolean);
    const captionWords = (caption || '').toUpperCase().trim().split(/\s+/).filter(Boolean);
    const all = [...titleWords, ...captionWords];

    if (all.length === 0) return null;

    const sel = new Set(selected);
    const toggle = (i: number) => {
        const next = new Set(sel);
        if (next.has(i)) next.delete(i);
        else next.add(i);
        onChange([...next].sort((a, b) => a - b));
    };

    const Chip = ({ word, idx, group }: { word: string; idx: number; group: 'title' | 'caption' }) => {
        const active = sel.has(idx);
        return (
            <button
                key={`${group}-${idx}`}
                onClick={() => toggle(idx)}
                disabled={disabled}
                className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all disabled:cursor-not-allowed"
                style={{
                    background: active ? `${KUMOLAB_PURPLE}25` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${active ? KUMOLAB_PURPLE : 'rgba(255,255,255,0.08)'}`,
                    color: active ? KUMOLAB_PURPLE : 'var(--text-tertiary)',
                }}
            >
                {word}
            </button>
        );
    };

    return (
        <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)', opacity: disabled ? 0.4 : 1 }}>
            <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
                    Color words KumoLab purple
                </span>
                {selected.length > 0 && (
                    <button
                        onClick={() => onChange([])}
                        disabled={disabled}
                        className="text-[9px] uppercase tracking-wider hover:underline disabled:cursor-not-allowed"
                        style={{ color: 'var(--text-tertiary)' }}
                    >
                        Clear all
                    </button>
                )}
            </div>
            <div className="flex flex-wrap gap-1.5">
                {titleWords.map((w, i) => <Chip key={`t-${i}`} word={w} idx={i} group="title" />)}
            </div>
            {captionWords.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {captionWords.map((w, i) => (
                        <Chip key={`c-${i}`} word={w} idx={titleWords.length + i} group="caption" />
                    ))}
                </div>
            )}
        </div>
    );
}

function StatusPill({ status }: { status: string | null }) {
    const cfg: Record<string, { color: string; label: string }> = {
        pending: { color: '#ffaa00', label: 'Pending' },
        approved: { color: '#00d4ff', label: 'Approved' },
        published: { color: '#00ff88', label: 'Published' },
        declined: { color: '#9ca3af', label: 'Declined' },
    };
    const c = cfg[status || ''] || { color: '#9ca3af', label: status || 'Unknown' };
    return (
        <span
            className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ background: `${c.color}18`, border: `1px solid ${c.color}35`, color: c.color }}
        >
            {c.label}
        </span>
    );
}
