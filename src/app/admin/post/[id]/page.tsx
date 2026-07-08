'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import VideoEditor from '@/components/admin/post/VideoEditor';
import { defaultSocialHashtags, sanitizeTag } from '@/lib/social/hashtags';

// Cap mirrors buildSocialHashtags' publish-time cap so what the operator
// sees here is exactly what publishes. Lean 4-6 is the proven sweet spot.
const MAX_HASHTAGS = 6;

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
    convertToReel: boolean;             // if true, image-only post is converted to a 12s Ken-Burns Reel before publishing
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
    convertToReel: false,
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
    // Social hashtags shown as editable chips. Hydrated on load from the saved
    // list, or auto-derived when the post has none yet. What's here is what
    // publishes (capped at 6).
    const [hashtags, setHashtags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);

    // Probe the current source image's natural dimensions whenever it
    // changes. Lets the user see if they're working with a small
    // (low-quality) source before they decide to publish or convert
    // to Reel — AniList "large" covers come back ~460x650, which
    // pixelates badly when blown up to 1080x1920.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!sourceUrl) { setImageDims(null); return; }
        let cancelled = false;
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            if (!cancelled) setImageDims({ w: img.naturalWidth, h: img.naturalHeight });
        };
        img.onerror = () => {
            if (!cancelled) setImageDims(null);
        };
        img.src = sourceUrl;
        return () => { cancelled = true; };
    }, [sourceUrl]);
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
    // Latest VideoEditor settings snapshot (text overlays, trim, fill…), so the
    // top-bar Save can persist the in-progress video draft for video posts.
    const videoSettingsRef = useRef<any>(null);

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
                // Hashtags: use the saved list if the operator set one before;
                // otherwise pre-fill with the auto-derived defaults so the tags
                // are visible and editable BEFORE approving (they used to be
                // invisible until publish). Either way, what's shown publishes.
                setHashtags(
                    Array.isArray(data.hashtags) && data.hashtags.length
                        ? data.hashtags
                        : defaultSocialHashtags({
                            title: data.title || '',
                            claim_type: data.claim_type,
                            anime_id: data.anime_id,
                        }),
                );
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
                        convertToReel: s.convertToReel ?? prev.convertToReel,
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
                // If a staged video exists at all, this post's editor is
                // a video editor — skip the image preview render. Mirrors
                // the isVideoPost check below so the initial render and
                // the conditional UI stay in sync.
                const isVideoImport = !!data.social_ids?.staged_video_url;
                if (!isVideoImport) {
                    // Fire a preview render immediately with the default toggle
                    // state (all OFF). This makes the displayed image actually
                    // match the toggle UI on open — without it, the editor was
                    // showing whatever was last persisted to post.image (which
                    // for posts touched by the pre-fix editor still has overlays
                    // baked in). Render-on-open also makes Force Regenerate's
                    // result feel meaningful — the displayed image is now
                    // demonstrably "what these settings produce right now."
                    kickPreview(data);
                }
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

    // Video posts have staged_video_url set on social_ids. Two paths
    // land here: (1) import-from-url, which leaves image null; (2) the
    // Find Video / scrape-attach flow on a screenshot post, which keeps
    // image as the website hero but stages a video for social publish.
    // Either way, if a staged video exists the operator wants to see
    // and trim it — render VideoEditor regardless of whether an image
    // is also present.
    const isVideoPost = !!(post?.social_ids?.staged_video_url);

    async function handleSave(opts: { thenApprove?: boolean; asDraft?: boolean } = {}) {
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
        //
        // Video posts skip the image render entirely — title + caption are
        // the only mutable fields here; the video itself is processed via
        // VideoEditor's own "Apply changes" button against /api/admin/video-process.
        const action = opts.thenApprove ? 'approve' : 'save';
        setBusy(action);
        setError(null);
        try {
            let imageBytesForSave: string | undefined;
            if (!isVideoPost) {
                const renderJson = await callJson('/api/admin/render-post-image', {
                    postId: id,
                    sourceUrl: sourceUrl || undefined,
                    title,
                    excerpt,
                    settings,
                    persist: true,
                    previewImage: lastPreviewBytes.current || undefined,
                });
                imageBytesForSave = renderJson.image;
            }

            // Video posts: persist the in-progress editor draft (text overlays,
            // trim, fill) before saving title/caption, so Save never silently
            // drops unrendered text. Lightweight — no FFmpeg, no bucket write.
            if (isVideoPost && videoSettingsRef.current) {
                const draftRes = await fetch('/api/admin/video-process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ postId: id, draftOnly: true, ...videoSettingsRef.current }),
                });
                const draftJson = await draftRes.json().catch(() => ({}));
                if (!draftRes.ok || draftJson.success === false) {
                    throw new Error(draftJson.error || `Could not save video draft (HTTP ${draftRes.status})`);
                }
            }

            const putBody: Record<string, any> = { id, title, excerpt, content, hashtags };
            if (imageBytesForSave) putBody.image = imageBytesForSave;
            // "Save draft" parks the post in the Draft tab (out of Pending) so
            // the operator can come back to it. Only applied to a post that's
            // still pre-publish — never demote an approved/published post.
            if (opts.asDraft && (post.status === 'pending' || post.status === 'draft')) {
                putBody.status = 'draft';
            }
            const res = await fetch('/api/posts', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(putBody),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) {
                throw new Error(json.error || `Save failed (HTTP ${res.status})`);
            }

            if (opts.thenApprove) {
                await callJson('/api/admin/approve', { postIds: [id] });
            }

            // Return to the tab the operator came from (same as Cancel), not
            // the dashboard. refresh() invalidates the list cache so the
            // restored tab shows the updated/moved post.
            goBackToList();
            router.refresh();
        } catch (e: any) {
            setError(e?.message || 'Save failed');
            setBusy(null);
        }
    }

    // Return the operator to wherever they came from (e.g. the Drafts tab),
    // not always the dashboard. router.back() pops the editor's history entry,
    // restoring the previous list and its active tab. PostsList persists the
    // tab in sessionStorage so it survives the round trip. Falls back to the
    // posts list when the editor was opened via a direct link / refresh (no
    // in-app history). Used by Cancel, Save, and Save draft alike.
    function goBackToList() {
        if (typeof window !== 'undefined' && window.history.length > 1) {
            router.back();
        } else {
            router.push('/admin/posts');
        }
    }

    function handleCancel() {
        // Discard everything: no DB writes, no render persistence. The post
        // remains exactly as it was when the editor opened.
        goBackToList();
    }

    async function handleRegenerate(opts: { silent?: boolean } = {}) {
        // Video posts have no image to render — the VideoEditor owns their
        // preview. Bail before hitting the image endpoint, otherwise a mere
        // title edit (title onBlur fires this) errors with "no image to
        // render from".
        if (isVideoPost) return;
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
            // A silent render is a background nicety (e.g. title onBlur) — never
            // surface its failure to the operator. Only explicit renders alert.
            if (!opts.silent) setError(e?.message || 'Render failed');
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
    // Pre-publish posts (pending or saved-as-draft) get the full
    // Cancel · Save draft · Save layout; everything else just Cancel · Save.
    const isDraftable = post.status === 'pending' || post.status === 'draft';
    const claimLabel = (post.claim_type || 'OTHER').replace(/_/g, ' ');

    return (
        <div className="max-w-3xl mx-auto space-y-4 pb-12">
            {/* Header strip — Cancel / (Save+Approve if pending) / Save */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="ak-display" style={{ fontSize: '20px' }}>Edit Post</h1>
                    <div className="flex items-center gap-2 mt-1.5">
                        <StatusPill status={post.status} />
                        <span className="ak-caption" style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {claimLabel} · {post.source}
                        </span>
                    </div>
                </div>
                {/* Cancel · Save draft · Save. Save draft keeps the post
                    pending; Save approves + auto-schedules (pending posts).
                    For non-pending posts there's nothing to approve, so a
                    single plain Save. */}
                <div className="flex gap-2">
                    {isVideoPost && (
                        <button onClick={() => router.push(`/admin/post/${id}/studio`)} className="ak-btn ak-btn--secondary" title="Open the full multi-track video editor">
                            🎬 Open in Studio
                        </button>
                    )}
                    <button onClick={handleCancel} disabled={!!busy} className="ak-btn ak-btn--ghost">
                        Cancel
                    </button>
                    {isDraftable ? (
                        <>
                            <button
                                onClick={() => handleSave({ asDraft: true })}
                                disabled={!!busy}
                                className="ak-btn ak-btn--secondary"
                            >
                                {busy === 'save' ? 'Saving…' : 'Save draft'}
                            </button>
                            <button
                                onClick={() => handleSave({ thenApprove: true })}
                                disabled={!!busy}
                                title="Save and approve: auto-schedules the post for publishing"
                                className="ak-btn ak-btn--primary"
                            >
                                {busy === 'approve' ? 'Saving…' : 'Save & approve'}
                            </button>
                        </>
                    ) : (
                        <button onClick={() => handleSave()} disabled={!!busy} className="ak-btn ak-btn--primary">
                            {busy === 'save' ? 'Saving…' : 'Save'}
                        </button>
                    )}
                </div>
            </div>

            {error && <div className="ak-auth__err" style={{ textAlign: 'left' }}>{error}</div>}

            {/* ── Social hashtags ───────────────────────────────────
                Editable chips, auto-filled from the anime name + claim type
                (plus a fan abbreviation when one exists). Visible and editable
                BEFORE approving — what's shown here is exactly what gets
                appended to the IG / FB / Threads captions (capped at 6). */}
            <Card className="p-5">
                <div className="flex items-center justify-between gap-2 mb-3">
                    <label className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
                        Social hashtags
                    </label>
                    <button
                        type="button"
                        onClick={() => setHashtags(defaultSocialHashtags({ title, claim_type: post.claim_type, anime_id: post.anime_id }))}
                        className="ak-btn ak-btn--ghost ak-btn--sm shrink-0"
                    >
                        Reset to auto
                    </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {hashtags.map((tag, i) => (
                        <span
                            key={`${tag}-${i}`}
                            className="inline-flex items-center gap-1 pl-3 pr-1 py-1.5 rounded-full text-xs font-semibold"
                            style={{ background: `${KUMOLAB_PURPLE}18`, border: `1px solid ${KUMOLAB_PURPLE}66`, color: '#5b3fc4' }}
                        >
                            {tag}
                            <button
                                type="button"
                                aria-label={`Remove ${tag}`}
                                onClick={() => setHashtags(hashtags.filter((_, idx) => idx !== i))}
                                className="flex items-center justify-center w-6 h-6 rounded-full text-base leading-none transition-all hover:bg-black/[0.06]"
                                style={{ color: '#5b3fc4' }}
                            >
                                &times;
                            </button>
                        </span>
                    ))}
                    {hashtags.length < MAX_HASHTAGS && (
                        <input
                            type="text"
                            value={tagInput}
                            onChange={e => setTagInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ',') {
                                    e.preventDefault();
                                    const t = sanitizeTag(tagInput);
                                    if (t && !hashtags.some(h => h.toLowerCase() === t.toLowerCase())) {
                                        setHashtags([...hashtags, t].slice(0, MAX_HASHTAGS));
                                    }
                                    setTagInput('');
                                } else if (e.key === 'Backspace' && !tagInput && hashtags.length) {
                                    setHashtags(hashtags.slice(0, -1));
                                }
                            }}
                            onBlur={() => {
                                // Commit a half-typed tag on blur so it isn't lost
                                // when the operator taps Save (esp. on mobile where
                                // the keyboard's "Go" may not fire Enter here).
                                const t = sanitizeTag(tagInput);
                                if (t && !hashtags.some(h => h.toLowerCase() === t.toLowerCase())) {
                                    setHashtags([...hashtags, t].slice(0, MAX_HASHTAGS));
                                }
                                setTagInput('');
                            }}
                            placeholder="+ add"
                            inputMode="text"
                            autoCapitalize="off"
                            autoCorrect="off"
                            className="bg-transparent text-xs focus:outline-none px-2 py-2 min-w-[88px] flex-1"
                            style={{ color: 'var(--text-primary)' }}
                        />
                    )}
                </div>
                <p className="mt-3 text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    {hashtags.length}/{MAX_HASHTAGS} tags · appended to Instagram, Facebook and Threads captions. Tap &times; to remove, type and press Enter to add.
                </p>
            </Card>

            {/* ── Title + Caption ──────────────────────────────────
                For video posts these live in a SINGLE bubble at the very
                top (Title above Caption), then the video editor below.
                Image posts keep the original order: preview → Title → Caption. */}
            {isVideoPost ? (
                <>
                    {/* One combined bubble: Title on top, Caption below. */}
                    <Card className="p-5 space-y-5">
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-[0.22em] mb-2" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
                                Title
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                onBlur={() => handleRegenerate({ silent: true })}
                                className="w-full bg-transparent text-lg md:text-xl font-bold leading-snug focus:outline-none"
                                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
                            />
                            <p className="mt-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                Headline on the website + first line of social captions.
                            </p>
                        </div>
                        <div className="pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <label className="block text-[10px] font-bold uppercase tracking-[0.22em] mb-2" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
                                Caption
                            </label>
                            <textarea
                                value={content}
                                onChange={e => setContent(e.target.value)}
                                rows={5}
                                className="w-full bg-transparent text-sm leading-relaxed focus:outline-none resize-none"
                                style={{ color: 'var(--text-primary)' }}
                            />
                            <p className="mt-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                Body on the website + caption below the title on Instagram, Facebook, and Threads.
                            </p>
                        </div>
                    </Card>

                    <VideoEditor
                        postId={id}
                        // Always load the immutable original. staged_video_url is
                        // the publisher's current trimmed file; the editor needs
                        // the full source to let the operator re-trim freely.
                        // Legacy posts (imported before original_video_url existed)
                        // fall back to staged_video_url, which on a never-trimmed
                        // post is identical to the original.
                        initialVideoUrl={post.social_ids.original_video_url || post.social_ids.staged_video_url}
                        initialStagedUrl={post.social_ids.staged_video_url}
                        initialSettings={post.image_settings?.video}
                        onSettingsChange={(s) => { videoSettingsRef.current = s; }}
                        onProcessed={(newUrl) => {
                            // Mirror the new URL onto local post state so other
                            // parts of the page (Save, etc.) reflect the change
                            // without a full reload.
                            setPost((prev: any) => prev ? {
                                ...prev,
                                social_ids: { ...prev.social_ids, staged_video_url: newUrl },
                            } : prev);
                        }}
                    />
                </>
            ) : (
                <>
                    {/* ── Image preview ─────────────────────────────── */}
                    <Card>
                        <div className="aspect-[4/5] w-full relative" style={{ background: 'var(--surface-2)' }}>
                            {imageUrl && !imageError ? (
                                <>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        key={imageUrl}
                                        src={imageUrl}
                                        alt={title}
                                        className="w-full h-full object-cover"
                                        onError={() => setImageError('Image failed to load. The source may be expired or blocked.')}
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
                                        Open "Image source" below to set one.
                                    </span>
                                </div>
                            )}
                        </div>
                    </Card>

                    {/* ── Title — prominent, magazine-style ─────────── */}
                    <Card className="p-5">
                        <label className="block text-[10px] font-bold uppercase tracking-[0.22em] mb-2" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
                            Title
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            onBlur={() => handleRegenerate({ silent: true })}
                            className="w-full bg-transparent text-lg md:text-xl font-bold leading-snug focus:outline-none"
                            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}
                        />
                        <p className="mt-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            Headline on the website + first line of social captions.
                        </p>
                    </Card>

                    {/* ── Caption — the body that publishes ─────────── */}
                    <Card className="p-5">
                        <label className="block text-[10px] font-bold uppercase tracking-[0.22em] mb-2" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
                            Caption
                        </label>
                        <textarea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            rows={5}
                            className="w-full bg-transparent text-sm leading-relaxed focus:outline-none resize-none"
                            style={{ color: 'var(--text-primary)' }}
                        />
                        <p className="mt-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            Body on the website + caption below the title on Instagram, Facebook, and Threads.
                        </p>
                    </Card>
                </>
            )}

            {/* ── 4. Overlay & image editing — collapsed by default ── */}
            {/* Hidden entirely for video posts — the image canvas overlay
                model doesn't apply to video imports; VideoEditor (Section 1)
                already owns trim + watermark for that flow. */}
            {!isVideoPost && (
            <Collapsible
                title="Overlay & image editing"
                hint="Customize the text rendered on the image, gradients, watermark, and layout"
            >
                {/* Sub-section: overlay sub-caption + purple word picker */}
                <div className="p-5 space-y-4">
                    <SectionLabel>Overlay text</SectionLabel>
                    <div>
                        <label className="block text-[9px] font-bold uppercase tracking-[0.2em] mb-1.5" style={{ color: 'var(--text-muted)' }}>
                            Overlay sub-caption
                        </label>
                        <input
                            type="text"
                            value={excerpt}
                            onChange={e => setExcerpt(e.target.value)}
                            onBlur={() => handleRegenerate({ silent: true })}
                            placeholder="Short line rendered under the title on the image"
                            className="ak-field__input"
                        />
                        <p className="mt-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            Small text under the title <em>on the image only</em>. Separate from the social-media caption above.
                        </p>
                    </div>
                    <PurpleWordPicker
                        disabled={!settings.applyText}
                        title={title}
                        caption={excerpt}
                        selected={settings.purpleWordIndices}
                        onChange={next => setSettings(s => ({ ...s, purpleWordIndices: next }))}
                    />
                </div>

                {/* Sub-section: overlay toggles + gradient */}
                <div className="p-5 border-t" style={{ borderColor: 'var(--line)' }}>
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
                            hint="@kumolabanime mark"
                            value={settings.applyWatermark}
                            onChange={v => setSettings(s => ({ ...s, applyWatermark: v }))}
                        />
                        <Toggle
                            label="Convert image to Reel"
                            hint="12s slow-zoom; publishes as Reel on IG / FB / Threads"
                            value={settings.convertToReel}
                            onChange={v => setSettings(s => ({ ...s, convertToReel: v }))}
                        />

                        <div className="pt-2 border-t space-y-2.5" style={{ borderColor: 'var(--line)' }}>
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
                                                    background: active ? 'var(--blue-soft)' : 'var(--surface-2)',
                                                    border: `1px solid ${active ? '#bcd4f2' : 'var(--line-2)'}`,
                                                    color: active ? '#1d5cb4' : 'var(--ink-3)',
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
                        className="ak-btn ak-btn--secondary ak-btn--block"
                        style={{ marginTop: '16px' }}
                    >
                        {busy === 'render' ? 'Rendering…' : 'Force Regenerate'}
                    </button>
                </div>

                {/* Sub-section: layout (scale + position per element) */}
                <div className="p-5 space-y-4 border-t" style={{ borderColor: 'var(--line)' }}>
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
                        label="Sub-caption"
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
                </div>
            </Collapsible>
            )}

            {/* ── 5. Image source — collapsed by default ──────────── */}
            {!isVideoPost && (
            <Collapsible
                title="Image source"
                hint="Replace the background image: upload, paste a URL, or reset to a fresh original"
            >
                <div className="p-5">
                    <Field label="Background image" hint="Upload your own picture, paste a direct image URL, or hit Reset to fetch a fresh original (clears any baked-in overlay from prior renders). URL must be a direct image, not a YouTube watch page.">
                        {imageDims && (
                            (() => {
                                const minDim = Math.min(imageDims.w, imageDims.h);
                                const tier = minDim < 600 ? 'low' : minDim < 1000 ? 'ok' : 'good';
                                const tierColor = tier === 'low' ? '#ff7777' : tier === 'ok' ? '#ffaa00' : '#7af0a8';
                                const tierLabel = tier === 'low' ? 'LOW' : tier === 'ok' ? 'OK' : 'GOOD';
                                const tierHint = tier === 'low'
                                    ? 'will pixelate if you Convert to Reel'
                                    : tier === 'ok'
                                        ? 'acceptable for static post; soft if Reel-converted'
                                        : 'high enough for crisp Reel conversion';
                                return (
                                    <div className="flex items-center gap-2 mb-2 -mt-1">
                                        <span
                                            className="text-[9px] font-bold uppercase tracking-[0.2em] px-2 py-1 rounded"
                                            style={{
                                                background: `${tierColor}15`,
                                                border: `1px solid ${tierColor}40`,
                                                color: tierColor,
                                                fontFamily: 'var(--font-display)',
                                            }}
                                        >
                                            {imageDims.w} × {imageDims.h} · {tierLabel}
                                        </span>
                                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                            {tierHint}
                                        </span>
                                    </div>
                                );
                            })()
                        )}
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                            <input
                                type="text"
                                value={sourceUrl}
                                onChange={e => setSourceUrl(e.target.value)}
                                placeholder="https://… (direct .jpg / .png / .webp)"
                                className="ak-field__input flex-1"
                                style={{ fontFamily: 'monospace' }}
                            />
                            <button
                                onClick={handleReset}
                                disabled={!!busy}
                                className="ak-btn ak-btn--secondary"
                                title="Re-fetch a clean original image and discard any baked overlay"
                            >
                                Reset
                            </button>
                            <label
                                className="ak-btn ak-btn--primary cursor-pointer text-center"
                                style={{ opacity: busy ? 0.4 : 1 }}
                            >
                                {busy === 'render' ? 'Working…' : 'Upload image'}
                                <input
                                    type="file"
                                    accept="image/*"
                                    disabled={!!busy}
                                    onChange={e => {
                                        const f = e.target.files?.[0];
                                        if (f) handleUpload(f);
                                        e.target.value = '';
                                    }}
                                    className="hidden"
                                />
                            </label>
                        </div>
                    </Field>
                </div>
            </Collapsible>
            )}

            {/* ── 6. Quick actions ─────────────────────────────────── */}
            {isPending && (
                <Card className="p-4">
                    <SectionLabel>Quick actions</SectionLabel>
                    <button
                        onClick={handleDecline}
                        disabled={!!busy}
                        className="ak-btn ak-btn--secondary ak-btn--block"
                        style={{ marginTop: '12px' }}
                    >
                        {busy === 'decline' ? 'Declining…' : 'Decline & Remove'}
                    </button>
                </Card>
            )}

            <Card className="p-4">
                <button
                    onClick={handleDelete}
                    disabled={!!busy}
                    className="ak-btn ak-btn--danger ak-btn--block"
                >
                    {busy === 'delete' ? 'Deleting…' : 'Delete permanently'}
                </button>
            </Card>
        </div>
    );
}

// Collapsible section using native <details>. Closed by default. The
// summary row is the click target; the chevron rotates 180° when open
// (uses Tailwind's [&[open]>summary>span.chev] arbitrary variant, no
// extra state needed).
function Collapsible({
    title,
    hint,
    defaultOpen,
    children,
}: {
    title: string;
    hint?: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    return (
        <details
            open={defaultOpen}
            className="rounded-xl overflow-hidden group"
            style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                boxShadow: 'var(--shadow-0)',
            }}
        >
            <summary
                className="px-5 py-4 cursor-pointer flex items-center justify-between gap-3 hover:bg-black/[0.02] transition-colors list-none [&::-webkit-details-marker]:hidden"
            >
                <div className="min-w-0">
                    <div
                        className="text-[11px] font-bold uppercase tracking-[0.22em]"
                        style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}
                    >
                        {title}
                    </div>
                    {hint && (
                        <div className="mt-1 text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                            {hint}
                        </div>
                    )}
                </div>
                <span
                    className="shrink-0 text-[10px] font-mono transition-transform group-open:rotate-180"
                    style={{ color: 'var(--text-muted)' }}
                    aria-hidden
                >
                    ▾
                </span>
            </summary>
            <div className="border-t" style={{ borderColor: 'var(--line)' }}>
                {children}
            </div>
        </details>
    );
}

// ─── UI primitives ────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div
            className={`rounded-xl overflow-hidden ${className}`}
            style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                boxShadow: 'var(--shadow-0)',
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
            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg transition-all hover:bg-black/[0.02]"
            style={{ background: 'transparent' }}
        >
            <div className="flex flex-col items-start">
                <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{label}</span>
                {hint && <span className="text-[9px]" style={{ color: 'var(--ink-3)' }}>{hint}</span>}
            </div>
            <span
                className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                style={{
                    background: value ? 'var(--gold)' : 'var(--line-2)',
                    border: '1px solid transparent',
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
                    className="ml-auto px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all hover:bg-black/[0.03] disabled:cursor-not-allowed"
                    style={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--line-2)',
                        color: 'var(--ink-2)',
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
            className="w-7 h-7 rounded text-xs font-bold transition-all hover:bg-black/[0.03] disabled:cursor-not-allowed"
            style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--line-2)',
                color: 'var(--ink)',
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
                    background: active ? `${KUMOLAB_PURPLE}22` : 'var(--surface-2)',
                    border: `1px solid ${active ? KUMOLAB_PURPLE : 'var(--line-2)'}`,
                    color: active ? '#6b4fd6' : 'var(--ink-2)',
                }}
            >
                {word}
            </button>
        );
    };

    return (
        <div className="space-y-1.5 pt-2 border-t" style={{ borderColor: 'var(--line)', opacity: disabled ? 0.4 : 1 }}>
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
    const cls: Record<string, string> = {
        pending: 'ak-badge--pending',
        approved: 'ak-badge--scheduled',
        published: 'ak-badge--published',
        declined: 'ak-badge--draft',
    };
    const label: Record<string, string> = {
        pending: 'Pending', approved: 'Approved', published: 'Published', declined: 'Declined',
    };
    const variant = cls[status || ''] || 'ak-badge--draft';
    return <span className={`ak-badge ${variant}`}>{label[status || ''] || status || 'Unknown'}</span>;
}
