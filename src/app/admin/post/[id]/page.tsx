'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { defaultSocialHashtags, sanitizeTag } from '@/lib/social/hashtags';
import { pickLayoutSettings } from '@/lib/studio/slides';

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
    imageScale: number;                 // background zoom: 1 = cover-fit, 0.5–3 supported by the renderer
    imagePosition: XY;                  // background pan, FRACTIONS of canvas (renderer multiplies by W/H)
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
    imageScale: 1,
    imagePosition: { x: 0, y: 0 },
};

// ── Carousel slides ───────────────────────────────────────────
// A slide is a full, independent picture: its own background source, its own
// overlay settings, and its own overlay title/sub-caption. A post with 2+
// slides is a carousel; 0-1 slides is the legacy single-image path and keeps
// persisting in the legacy image_settings shape (no slides array), so every
// auto-pipeline post and existing draft behaves exactly as before.
interface SlideState {
    sourceUrl: string;
    settings: Settings;
    title: string;
    excerpt: string;
}

// ── Layout templates ──────────────────────────────────────────
// A saved "look": the layout/style subset of a slide's Settings (toggles,
// gradient, watermark, scales, offsets, image zoom/pan — LAYOUT_TEMPLATE_KEYS
// in lib/studio/slides.ts). Never the slide's text, image, or word colors.
// Persisted in the studio_templates table via /api/admin/studio/templates,
// so templates survive reloads and are shared across posts and devices.
interface LayoutTemplate {
    id: string;
    name: string;
    settings: Partial<Settings>;
    created_at?: string;
}

// Fresh deep copy of the defaults so slides never share offset objects.
function makeDefaultSettings(): Settings {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

// Hydrate a Settings object from a raw image_settings-shaped snapshot,
// key-by-key with default fallbacks — the exact rules the editor has always
// used for the top-level snapshot, reused per slide.
function hydrateSettings(raw: any): Settings {
    const s = raw && typeof raw === 'object' ? raw : {};
    return {
        ...DEFAULT_SETTINGS,
        applyText: s.applyText ?? DEFAULT_SETTINGS.applyText,
        applyGradient: s.applyGradient ?? DEFAULT_SETTINGS.applyGradient,
        applyWatermark: s.applyWatermark ?? DEFAULT_SETTINGS.applyWatermark,
        gradientPosition: s.gradientPosition ?? DEFAULT_SETTINGS.gradientPosition,
        gradientStrength: s.gradientStrength ?? DEFAULT_SETTINGS.gradientStrength,
        titleScale: s.titleScale ?? DEFAULT_SETTINGS.titleScale,
        captionScale: s.captionScale ?? DEFAULT_SETTINGS.captionScale,
        titleOffset: s.titleOffset ?? DEFAULT_SETTINGS.titleOffset,
        captionOffset: s.captionOffset ?? DEFAULT_SETTINGS.captionOffset,
        watermarkPosition: s.watermarkPosition ?? DEFAULT_SETTINGS.watermarkPosition,
        purpleWordIndices: s.purpleWordIndices ?? DEFAULT_SETTINGS.purpleWordIndices,
        convertToReel: s.convertToReel ?? DEFAULT_SETTINGS.convertToReel,
        imageScale: s.imageScale ?? DEFAULT_SETTINGS.imageScale,
        imagePosition: s.imagePosition ?? DEFAULT_SETTINGS.imagePosition,
    };
}

// The wire shape persisted into image_settings.slides for each slide.
function toPersistSlide(sl: SlideState) {
    return { sourceUrl: sl.sourceUrl, title: sl.title, excerpt: sl.excerpt, settings: sl.settings };
}

// Smaller per-click nudge — 12px gives finer placement without feeling
// laggy. Earlier 30px was overshooting.
const NUDGE_PX = 12;
const KUMOLAB_PURPLE = '#9D7BFF';
const CANVAS_W = 1080;
const CANVAS_H = 1350;

// On-canvas drag: magnetic snap radius in canvas px. Within this distance
// of the horizontal center (offset.x → 0) or the bottom caption zone the
// dragged block clicks into place, with a visible guide (same idea as the
// VideoEditor's SNAP_THRESHOLD center snap).
const SNAP_PX = 28;
// Mirror of the renderer's text-zone centers (image-processor zoneY math):
// top zone = H*0.175 + 30, bottom zone = H - H*0.175 - 30.
const ZONE_Y_TOP = CANVAS_H * 0.175 + 30;
const ZONE_Y_BOTTOM = CANVAS_H - CANVAS_H * 0.175 - 30;

export default function PostEditor() {
    const params = useParams();
    const id = params?.id as string;
    const router = useRouter();

    const [post, setPost] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<null | 'save' | 'render' | 'approve' | 'decline' | 'delete'>(null);
    const [error, setError] = useState<string | null>(null);
    const [imageError, setImageError] = useState<string | null>(null);
    // Autosave: persists edits (settings + title/caption/hashtags) after every
    // change, marks studio activity, and promotes pending → draft. The explicit
    // Save still renders + publishes the image bytes.
    const [autosave, setAutosave] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const autosaveSnap = useRef<string>('');
    const autosaveTimer = useRef<NodeJS.Timeout | null>(null);

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

    // ── Carousel state ────────────────────────────────────────
    // slides[] always has >= 1 entry once the post loads. The ACTIVE slide
    // is mirrored into the existing title/excerpt/sourceUrl/settings states
    // (so the whole existing control panel keeps operating on plain state),
    // and syncedSlides() folds the live states back into the array whenever
    // the full set is needed (autosave, Save, the thumbnail strip).
    const [slides, setSlides] = useState<SlideState[]>([]);
    const [activeSlide, setActiveSlide] = useState(0);
    // True while the preview pager sits on the trailing "+" add-slide tile
    // (one past the last slide). The active slide stays the last real slide.
    const [addPane, setAddPane] = useState(false);
    const addFilesRef = useRef<HTMLInputElement>(null);
    // Monotonic token so a slow preview render for a previous slide can never
    // overwrite the preview of the slide the operator has since switched to.
    const previewToken = useRef(0);

    // Live-render plumbing: when a toggle changes (or title/caption is
    // edited and committed), debounce-fire a render so the preview reflects
    // the change without making the user hunt for the Regenerate button.
    const liveRenderTimer = useRef<NodeJS.Timeout | null>(null);
    const initialLoadDone = useRef(false);
    // The last preview render's base64 bytes. On Save we send these back to
    // the server so what publishes is byte-for-byte what the user just saw,
    // not a fresh render that might drift.
    const lastPreviewBytes = useRef<string | null>(null);
    // Layout metadata from the last render (block top y + total height on the
    // 1080x1350 canvas). Used to place the on-canvas drag handles over the
    // actual text block instead of guessing.
    const lastLayout = useRef<{ y: number; totalHeight: number } | null>(null);
    // ── On-canvas text drag (title/caption) ──────────────────
    const previewRef = useRef<HTMLDivElement>(null);
    const [draggingText, setDraggingText] = useState<null | 'title' | 'caption'>(null);
    const [snapGuides, setSnapGuides] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });
    const dragStart = useRef<{ px: number; py: number; offset: XY } | null>(null);
    // Drag-and-drop photo upload over the preview card.
    const [dropActive, setDropActive] = useState(false);
    const dropDepth = useRef(0);
    // Latest VideoEditor settings snapshot (text overlays, trim, fill…), so the
    // top-bar Save can persist the in-progress video draft for video posts.
    const videoSettingsRef = useRef<any>(null);

    // ── Layout templates ──────────────────────────────────────
    // Saved looks, loaded once from the server (DB-backed, so they persist
    // across sessions and posts). tplBusy serializes save/apply/delete.
    const [templates, setTemplates] = useState<LayoutTemplate[]>([]);
    const [tplBusy, setTplBusy] = useState<null | 'save' | 'apply' | 'delete'>(null);
    const [tplError, setTplError] = useState<string | null>(null);
    const [appliedTplId, setAppliedTplId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/admin/studio/templates', { cache: 'no-store', credentials: 'same-origin' });
                const json = await res.json().catch(() => ({}));
                if (!cancelled && res.ok && Array.isArray(json.templates)) setTemplates(json.templates);
            } catch {
                // Soft fail — the section just shows "no templates yet".
            }
        })();
        return () => { cancelled = true; };
    }, []);

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
                // Built as a plain object (not via the setter callback) so the
                // initial preview render below can use the SAME hydrated
                // settings — previously it rendered with DEFAULT_SETTINGS,
                // which showed a bare image after refresh even though the
                // controls were hydrated ON (WYSIWYG bug).
                let hydrated: Settings = { ...DEFAULT_SETTINGS };
                let hydratedSource = '';
                let hydratedSlides: SlideState[] = [];
                if (data.image_settings && typeof data.image_settings === 'object') {
                    const s = data.image_settings as any;
                    hydrated = hydrateSettings(s);
                    if (s.sourceUrl && typeof s.sourceUrl === 'string') {
                        hydratedSource = s.sourceUrl;
                    }
                    // Carousel hydration: 2+ saved slides make this a carousel.
                    // 0-1 slides (every auto-pipeline post + existing drafts)
                    // takes the legacy single-image path below, byte-identical
                    // to the pre-carousel editor. Slide 1's overlay text is the
                    // post's own title/excerpt (canonical DB columns), never a
                    // possibly-drifted copy inside the slides array.
                    if (Array.isArray(s.slides) && s.slides.length >= 2) {
                        hydratedSlides = s.slides
                            .filter((sl: any) => sl && typeof sl === 'object')
                            .map((sl: any, i: number): SlideState => ({
                                sourceUrl: typeof sl.sourceUrl === 'string' ? sl.sourceUrl : '',
                                settings: hydrateSettings(sl.settings),
                                title: i === 0 ? (data.title || '') : (typeof sl.title === 'string' ? sl.title : ''),
                                excerpt: i === 0 ? (data.excerpt || '') : (typeof sl.excerpt === 'string' ? sl.excerpt : ''),
                            }));
                    }
                }
                if (hydratedSlides.length >= 2) {
                    // Carousel: the editor opens on slide 1 (the cover). The
                    // per-slide snapshot is authoritative over the top-level
                    // legacy keys (which mirror slide 1 for old consumers).
                    hydrated = hydratedSlides[0].settings;
                    hydratedSource = hydratedSlides[0].sourceUrl;
                } else {
                    // Legacy single-image path: one slide wrapping the same
                    // state the editor has always hydrated.
                    hydratedSlides = [{
                        sourceUrl: hydratedSource,
                        settings: hydrated,
                        title: data.title || '',
                        excerpt: data.excerpt || '',
                    }];
                }
                setSlides(hydratedSlides);
                setActiveSlide(0);
                setSettings(hydrated);
                setSourceUrl(hydratedSource);
                setImageUrl(data.image || '');
                // If a staged video exists at all, this post's editor is
                // a video editor — skip the image preview render. Mirrors
                // the isVideoPost check below so the initial render and
                // the conditional UI stay in sync.
                const isVideoImport = !!data.social_ids?.staged_video_url;
                if (!isVideoImport) {
                    // Fire a preview render immediately with the JUST-HYDRATED
                    // settings (and source). What the operator saved is what
                    // they see the moment the editor opens — refresh-safe
                    // WYSIWYG. Fresh posts with no snapshot still render with
                    // the all-OFF defaults.
                    kickPreview(hydratedSlides[0]);
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
        settings.imageScale, settings.imagePosition.x, settings.imagePosition.y,
        // Reference the JSON so any change to the array triggers re-render.
        JSON.stringify(settings.purpleWordIndices),
    ]);

    // Autosave: ~1.5s after any edit, persist the edit state so work is never
    // lost. Best-effort, in place (no navigation, no image re-bake). Skips while
    // an explicit Save is running to avoid clobbering it.
    useEffect(() => {
        if (!initialLoadDone.current || !post) return;
        // The full slides array (active slide's live state folded in) is
        // what persists. Post-level fields (title/excerpt/settings/sourceUrl)
        // always mirror slide 1 — the cover — so a single-image post writes
        // the exact same payload as before carousels existed, and legacy
        // consumers (cron rebake, emergency re-render) keep reading a valid
        // top-level snapshot for carousels too.
        const all = syncedSlides();
        const cover = all[0];
        const payloadSlides = all.map(toPersistSlide);
        const snap = JSON.stringify({ content, hashtags, slides: payloadSlides });
        if (snap === autosaveSnap.current) return;
        if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
        autosaveTimer.current = setTimeout(async () => {
            if (busy) return; // explicit save owns the write right now
            setAutosave('saving');
            try {
                const res = await fetch('/api/admin/studio/autosave-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        postId: id,
                        title: cover.title,
                        excerpt: cover.excerpt,
                        content,
                        hashtags,
                        settings: cover.settings,
                        sourceUrl: cover.sourceUrl,
                        slides: payloadSlides,
                    }),
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json.success === false) throw new Error(json.error || 'Autosave failed');
                autosaveSnap.current = snap;
                if (json.status && post.status !== json.status) setPost((p: any) => (p ? { ...p, status: json.status } : p));
                setAutosave('saved');
            } catch {
                setAutosave('error');
            }
        }, 1500);
        return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [title, excerpt, content, hashtags, JSON.stringify(settings), sourceUrl, JSON.stringify(slides), activeSlide]);

    // Preview-render helper that doesn't depend on the title/excerpt useState
    // values (avoids the "stale state" race when called from inside the
    // post-load effect or right after a slide switch). Pass the slide's
    // source + settings + overlay text in directly, so the render always
    // matches the slide being shown (refresh-safe WYSIWYG). The render route
    // is stateless per call, so any slide can be previewed the same way.
    async function kickPreview(slide: { sourceUrl: string; settings: Settings; title: string; excerpt: string }) {
        const token = ++previewToken.current;
        try {
            const res = await fetch('/api/admin/render-post-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    postId: id,
                    sourceUrl: slide.sourceUrl || undefined,
                    title: slide.title || '',
                    excerpt: slide.excerpt || '',
                    settings: slide.settings,
                    persist: false,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (json?.success && json.image && token === previewToken.current) {
                setImageUrl(json.image);
                if (typeof json.image === 'string' && json.image.startsWith('data:image/')) {
                    lastPreviewBytes.current = json.image;
                }
                if (json.layout) lastLayout.current = json.layout;
            }
        } catch {
            // Soft fail — leave imageUrl as-is and let the user toggle to retry.
        }
    }

    // ── Carousel helpers ──────────────────────────────────────
    // The full slides array with the ACTIVE slide's live editor state folded
    // in. This is the single source of truth handed to autosave, Save, and
    // the thumbnail strip — the inactive entries in `slides` plus whatever
    // the operator is editing right now.
    function syncedSlides(): SlideState[] {
        if (!slides.length) return [{ sourceUrl, settings, title, excerpt }];
        return slides.map((sl, i) => (i === activeSlide ? { sourceUrl, settings, title, excerpt } : sl));
    }

    // Mirror a slide into the editor states the whole control panel operates
    // on. Clears per-slide render caches so nothing from the previous slide
    // (preview bytes, drag-band layout) leaks into this one.
    function loadSlideIntoEditor(sl: SlideState) {
        setSettings(sl.settings);
        setSourceUrl(sl.sourceUrl);
        setTitle(sl.title);
        setExcerpt(sl.excerpt);
        lastPreviewBytes.current = null;
        lastLayout.current = null;
        setImageError(null);
        // The "Applied" marker refers to the slide it was applied to.
        setAppliedTplId(null);
        // Instant feedback: show the raw background right away; the rendered
        // overlay replaces it as soon as kickPreview returns.
        if (sl.sourceUrl) setImageUrl(sl.sourceUrl);
    }

    // Make a slide active: stash the current one, load the target, and kick
    // an immediate preview render for it (the render route is stateless, so
    // each slide previews with its own source + settings).
    function goToSlide(idx: number) {
        if (idx === activeSlide) { setAddPane(false); return; }
        const cur = syncedSlides();
        if (idx < 0 || idx >= cur.length) return;
        setAddPane(false);
        setSlides(cur);
        setActiveSlide(idx);
        loadSlideIntoEditor(cur[idx]);
        kickPreview(cur[idx]);
    }

    // Reorder: move the active slide one position left/right. The editor
    // states already hold this slide's content, so no reload or re-render is
    // needed — only its index changes. Note that whichever slide sits at
    // position 1 is the carousel cover (post.image + post title).
    function moveActive(dir: -1 | 1) {
        const cur = syncedSlides();
        const j = activeSlide + dir;
        if (j < 0 || j >= cur.length) return;
        const next = [...cur];
        [next[activeSlide], next[j]] = [next[j], next[activeSlide]];
        setSlides(next);
        setActiveSlide(j);
    }

    // Duplicate the active slide (deep copy) right after itself and select
    // the copy. The preview is already showing identical content.
    function duplicateActive() {
        const cur = syncedSlides();
        const copy: SlideState = JSON.parse(JSON.stringify(cur[activeSlide]));
        const next = [...cur.slice(0, activeSlide + 1), copy, ...cur.slice(activeSlide + 1)];
        setSlides(next);
        setActiveSlide(activeSlide + 1);
    }

    // Delete the active slide (never the last remaining one) and select its
    // neighbour.
    function deleteActive() {
        const cur = syncedSlides();
        if (cur.length <= 1) return;
        if (!confirm(`Remove slide ${activeSlide + 1}? Its edits are discarded.`)) return;
        const next = cur.filter((_, i) => i !== activeSlide);
        const idx = Math.min(activeSlide, next.length - 1);
        setSlides(next);
        setActiveSlide(idx);
        loadSlideIntoEditor(next[idx]);
        kickPreview(next[idx]);
    }

    // ── Layout template actions ───────────────────────────────
    // Save the ACTIVE slide's current look as a named template. Only the
    // layout subset is captured (pickLayoutSettings) — never this slide's
    // title/excerpt text, its image, or its purple word choices.
    async function saveLayoutTemplate() {
        const name = prompt('Template name (e.g. "Bottom caption + soft fade"):')?.trim();
        if (!name) return;
        setTplBusy('save');
        setTplError(null);
        try {
            const res = await fetch('/api/admin/studio/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ name, settings: pickLayoutSettings(settings) }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false || !json.template) {
                throw new Error(json.error || `Save failed (HTTP ${res.status})`);
            }
            setTemplates(prev => [json.template, ...prev]);
        } catch (e: any) {
            setTplError(e?.message || 'Could not save the template');
        } finally {
            setTplBusy(null);
        }
    }

    // Merge a template's layout keys into the ACTIVE slide's settings. The
    // slide keeps its own title/excerpt text, image, and word colors — only
    // the look changes. setSettings triggers the live preview re-render and
    // the autosave (both watch the settings state), so the applied look is
    // visible and persisted without extra plumbing.
    function applyLayoutTemplate(tpl: LayoutTemplate) {
        if (busy || tplBusy) return;
        // Deep-copy so offset objects are never shared between the template
        // list and the live settings state; re-pick client-side so a stale
        // or hand-edited row can never inject text/image/word-color keys.
        const layout = JSON.parse(JSON.stringify(pickLayoutSettings(tpl.settings))) as Partial<Settings>;
        setSettings(s => ({ ...s, ...layout }));
        setAppliedTplId(tpl.id);
        setTplError(null);
    }

    async function deleteLayoutTemplate(tpl: LayoutTemplate) {
        if (!confirm(`Delete the template "${tpl.name}"? Slides it was applied to keep their look.`)) return;
        setTplBusy('delete');
        setTplError(null);
        try {
            const res = await fetch(`/api/admin/studio/templates?id=${encodeURIComponent(tpl.id)}`, {
                method: 'DELETE',
                credentials: 'same-origin',
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) {
                throw new Error(json.error || `Delete failed (HTTP ${res.status})`);
            }
            setTemplates(prev => prev.filter(t => t.id !== tpl.id));
            if (appliedTplId === tpl.id) setAppliedTplId(null);
        } catch (e: any) {
            setTplError(e?.message || 'Could not delete the template');
        } finally {
            setTplBusy(null);
        }
    }

    // Upload one file to the editor-uploads staging area, return its URL.
    async function uploadFile(file: File): Promise<string> {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/admin/upload-image', {
            method: 'POST',
            credentials: 'same-origin',
            body: fd,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false || !json.url) {
            throw new Error(json.error || `Upload failed (HTTP ${res.status})`);
        }
        return json.url;
    }

    // Append one slide per uploaded image (each starts with the all-OFF
    // default settings and empty overlay text) and select the first new one.
    // This is how a single picture becomes a carousel from inside the editor
    // — via the "+" tile in the strip or the add-slide pane in the preview.
    async function handleAddSlides(files: File[]) {
        const imgs = files.filter(f => f.type.startsWith('image/'));
        if (!imgs.length) return;
        setBusy('render');
        setError(null);
        setImageError(null);
        try {
            const urls: string[] = [];
            for (const f of imgs) urls.push(await uploadFile(f));
            const cur = syncedSlides();
            const added: SlideState[] = urls.map(u => ({
                sourceUrl: u,
                settings: makeDefaultSettings(),
                title: '',
                excerpt: '',
            }));
            const next = [...cur, ...added];
            const idx = cur.length; // first newly-added slide
            setSlides(next);
            setActiveSlide(idx);
            loadSlideIntoEditor(next[idx]);
            setAddPane(false);
            await kickPreview(next[idx]);
        } catch (e: any) {
            setError(e?.message || 'Upload failed');
        } finally {
            setBusy(null);
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

    // ── On-canvas drag: estimated title/caption bands ─────────
    // The preview is a flat server-rendered image, so we place transparent
    // grab bands where the text block sits: block top + height come from the
    // renderer's layout metadata (falling back to the zone math), shifted by
    // the current nudge offsets. Values in canvas px (1080x1350).
    function textBands() {
        const zoneY = settings.gradientPosition === 'top' ? ZONE_Y_TOP : ZONE_Y_BOTTOM;
        const blockH = lastLayout.current?.totalHeight ?? 260;
        const blockTop = lastLayout.current?.y ?? (zoneY - blockH / 2);
        const hasCaption = (excerpt || '').trim().length > 0;
        // Title occupies roughly the upper ~62% of the combined block when a
        // caption exists (caption renders at ~55% of the title size).
        const titleFrac = hasCaption ? 0.62 : 1;
        const PAD = 24; // easier grabbing, esp. touch
        return {
            hasCaption,
            title: {
                top: blockTop + settings.titleOffset.y - PAD,
                height: blockH * titleFrac + PAD * 2,
            },
            caption: {
                top: blockTop + blockH * titleFrac + settings.captionOffset.y - PAD,
                height: blockH * (1 - titleFrac) + PAD * 2,
            },
        };
    }

    // Begin dragging a text block. The band elements set touch-action: none,
    // so on mobile the rest of the preview still scrolls the page while the
    // text bands drag. Movement is handled by the window-level effect below
    // (pointer events → mouse + touch), mirroring VideoEditor's approach.
    function beginTextDrag(target: 'title' | 'caption') {
        return (e: React.PointerEvent<HTMLDivElement>) => {
            if (!settings.applyText || busy) return;
            e.preventDefault();
            try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch { /* noop */ }
            const offset = target === 'title' ? settings.titleOffset : settings.captionOffset;
            dragStart.current = { px: e.clientX, py: e.clientY, offset: { ...offset } };
            setDraggingText(target);
        };
    }

    // Track the drag: convert screen-px deltas to canvas px via the preview's
    // rendered rect ((dx / rect.width) * 1080), then magnet-snap: x clicks to
    // the horizontal center (offset.x → 0) and y clicks to the bottom caption
    // zone, each within SNAP_PX, with visible guides.
    useEffect(() => {
        if (!draggingText) return;
        const target = draggingText;
        const move = (e: PointerEvent) => {
            const el = previewRef.current;
            const start = dragStart.current;
            if (!el || !start) return;
            const rect = el.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const dx = ((e.clientX - start.px) / rect.width) * CANVAS_W;
            const dy = ((e.clientY - start.py) / rect.height) * CANVAS_H;
            let nx = Math.round(start.offset.x + dx);
            let ny = Math.round(start.offset.y + dy);
            // Magnetic center snap (horizontal).
            const snapX = Math.abs(nx) < SNAP_PX;
            if (snapX) nx = 0;
            // Gentle snap band at the bottom caption zone. When the layout is
            // already bottom, that's offset.y = 0; when it's top, it's the
            // zone-to-zone distance.
            const bottomTargetY = settings.gradientPosition === 'bottom' ? 0 : Math.round(ZONE_Y_BOTTOM - ZONE_Y_TOP);
            const snapY = Math.abs(ny - bottomTargetY) < SNAP_PX;
            if (snapY) ny = bottomTargetY;
            setSnapGuides(prev => (prev.x === snapX && prev.y === snapY ? prev : { x: snapX, y: snapY }));
            setSettings(s => target === 'title'
                ? { ...s, titleOffset: { x: nx, y: ny } }
                : { ...s, captionOffset: { x: nx, y: ny } });
        };
        const up = () => {
            setDraggingText(null);
            setSnapGuides({ x: false, y: false });
            dragStart.current = null;
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draggingText, settings.gradientPosition]);

    // One-tap "Bottom" preset: park the element in the anime-caption bottom
    // zone. Offset {0,0} + gradientPosition 'bottom' IS the renderer's bottom
    // layout, so this is exact (not an approximation).
    function snapToBottom(target: 'title' | 'caption') {
        setSettings(s => ({
            ...s,
            gradientPosition: 'bottom',
            ...(target === 'title'
                ? { titleOffset: { x: 0, y: 0 } }
                : { captionOffset: { x: 0, y: 0 } }),
        }));
    }

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
            // Everything persists in terms of slides: slide 1 (the cover) is
            // what post.image + the post-level snapshot come from, so the
            // website/feed/publisher see a carousel post exactly like a
            // single-image post. For a single-image post the cover IS the
            // active editor state, so this is the same call as always.
            const allSlides = syncedSlides();
            const cover = allSlides[0];
            let imageBytesForSave: string | undefined;
            if (!isVideoPost) {
                // Only promote the cached preview bytes when they belong to
                // the cover slide (the operator may be looking at slide 3 —
                // those bytes must NOT become post.image). Otherwise the
                // server re-renders the cover from its own settings.
                const coverPreviewBytes = activeSlide === 0 ? lastPreviewBytes.current : null;
                const renderJson = await callJson('/api/admin/render-post-image', {
                    postId: id,
                    sourceUrl: cover.sourceUrl || undefined,
                    title: cover.title,
                    excerpt: cover.excerpt,
                    settings: cover.settings,
                    persist: true,
                    previewImage: coverPreviewBytes || undefined,
                    // Full carousel snapshot. The route stores it as
                    // image_settings.slides when there are 2+, and collapses
                    // back to the legacy shape (no slides key) when 0-1.
                    slides: allSlides.map(toPersistSlide),
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

            // Post-level title/excerpt come from the cover slide (for a
            // single-image post that's exactly the title/excerpt states).
            const putBody: Record<string, any> = { id, title: cover.title, excerpt: cover.excerpt, content, hashtags };
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
        const token = ++previewToken.current;
        try {
            const json = await callJson('/api/admin/render-post-image', {
                postId: id,
                sourceUrl: sourceUrl || undefined,
                title,
                excerpt,
                settings,
                persist: false,
            });
            if (token !== previewToken.current) return; // a newer slide render superseded this one
            setImageUrl(json.image); // base64 data URL — no cache-bust needed
            // Cache the bytes so Save can promote THIS exact render —
            // what the user is looking at right now becomes the published
            // image with no second render.
            if (typeof json.image === 'string' && json.image.startsWith('data:image/')) {
                lastPreviewBytes.current = json.image;
            }
            // Keep the drag handles glued to where the text actually is.
            if (json.layout) lastLayout.current = json.layout;
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
            const url = await uploadFile(file);
            // Use the uploaded URL as the render source for the next render.
            setSourceUrl(url);
            // Kick a render immediately so the user sees the uploaded image
            // swap into the preview without manual regenerate. setSourceUrl
            // hasn't applied yet in this closure, so pass the slide values
            // explicitly (kickPreview is state-free).
            await kickPreview({ sourceUrl: url, settings, title, excerpt });
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
                        {autosave !== 'idle' && (
                            <span className="ak-caption" style={{ color: autosave === 'error' ? 'var(--sun)' : 'var(--ink-3)' }}>
                                {autosave === 'saving' ? '· Saving…' : autosave === 'saved' ? '· Saved' : '· Autosave failed'}
                            </span>
                        )}
                    </div>
                </div>
                {/* Cancel · Save draft · Save. Save draft keeps the post
                    pending; Save approves + auto-schedules (pending posts).
                    For non-pending posts there's nothing to approve, so a
                    single plain Save. */}
                <div className="flex gap-2">
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

                    {/* Video editing lives entirely in the Studio — one clear,
                        professional entry point (no inline half-editor). */}
                    <Card className="p-5">
                        <div className="flex items-center gap-4">
                            <div className="relative shrink-0 rounded-lg overflow-hidden" style={{ width: 76, height: 100, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                                {post.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={post.image} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    // eslint-disable-next-line jsx-a11y/media-has-caption
                                    <video src={post.social_ids.staged_video_url} muted preload="metadata" className="w-full h-full object-cover" />
                                )}
                                <span className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(10,23,48,0.25)', color: '#fff', fontSize: 22 }}>▶</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="ak-heading">KumoLab Studio</div>
                                <p className="ak-body-sm" style={{ marginTop: 2 }}>
                                    Trim, add clips, text, music, transitions and export a finished vertical reel in the full editor.
                                </p>
                            </div>
                            <button className="ak-btn ak-btn--primary" onClick={() => router.push(`/admin/post/${id}/studio`)}>
                                Open Studio →
                            </button>
                        </div>
                    </Card>
                </>
            ) : (
                <>
                    {/* ── Image preview ─────────────────────────────── */}
                    <Card>
                        <div
                            ref={previewRef}
                            className="aspect-[4/5] w-full relative"
                            style={{ background: 'var(--surface-2)' }}
                            // Desktop drag-and-drop: dropping a picture anywhere on the
                            // preview feeds the existing upload flow (same as the
                            // "Upload image" button in Image source below).
                            onDragEnter={(e) => {
                                if (!e.dataTransfer.types.includes('Files')) return;
                                e.preventDefault();
                                dropDepth.current += 1;
                                setDropActive(true);
                            }}
                            onDragOver={(e) => {
                                if (!e.dataTransfer.types.includes('Files')) return;
                                e.preventDefault();
                            }}
                            onDragLeave={() => {
                                dropDepth.current = Math.max(0, dropDepth.current - 1);
                                if (dropDepth.current === 0) setDropActive(false);
                            }}
                            onDrop={(e) => {
                                e.preventDefault();
                                dropDepth.current = 0;
                                setDropActive(false);
                                const files = Array.from(e.dataTransfer.files || []).filter(x => x.type.startsWith('image/'));
                                if (!files.length) return;
                                // On the "+" add-slide pane every drop appends;
                                // on a slide, one file replaces its background
                                // while multiple files append as new slides.
                                if (addPane || files.length > 1) handleAddSlides(files);
                                else handleUpload(files[0]);
                            }}
                        >
                            {addPane ? (
                                /* "+" add-slide pane — the position one past the
                                   last slide. A slide-shaped upload/drop target:
                                   uploading here appends new slides, turning a
                                   single picture into a carousel. */
                                <button
                                    type="button"
                                    onClick={() => addFilesRef.current?.click()}
                                    disabled={!!busy}
                                    className="absolute inset-0 flex flex-col items-center justify-center gap-3 w-full px-6 text-center"
                                    style={{ background: 'var(--surface-2)', cursor: busy ? 'wait' : 'pointer' }}
                                >
                                    <span
                                        aria-hidden
                                        className="flex items-center justify-center"
                                        style={{
                                            width: 72,
                                            height: 90,
                                            borderRadius: 12,
                                            border: `2px dashed ${KUMOLAB_PURPLE}`,
                                            color: KUMOLAB_PURPLE,
                                            fontSize: 30,
                                            fontWeight: 700,
                                            background: 'rgba(157,123,255,0.08)',
                                        }}
                                    >
                                        +
                                    </span>
                                    <span className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
                                        {busy === 'render' ? 'Uploading…' : 'Add slide'}
                                    </span>
                                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                        Drop photos here or tap to upload — each picture becomes its own slide.
                                    </span>
                                </button>
                            ) : imageUrl && !imageError ? (
                                <>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        key={imageUrl}
                                        src={imageUrl}
                                        alt={title}
                                        className="w-full h-full object-cover"
                                        draggable={false}
                                        onError={() => setImageError('Image failed to load. The source may be expired or blocked.')}
                                    />

                                    {/* Transparent grab bands over the title + caption blocks.
                                        Drag to reposition (writes titleOffset/captionOffset);
                                        touch-action none confines scroll-blocking to the bands. */}
                                    {settings.applyText && (() => {
                                        const bands = textBands();
                                        const bandStyle = (band: { top: number; height: number }, active: boolean): React.CSSProperties => ({
                                            position: 'absolute',
                                            left: '2%',
                                            right: '2%',
                                            top: `${(band.top / CANVAS_H) * 100}%`,
                                            height: `${(band.height / CANVAS_H) * 100}%`,
                                            cursor: 'move',
                                            touchAction: 'none',
                                            zIndex: 3,
                                            outline: active ? `1px dashed ${KUMOLAB_PURPLE}` : 'none',
                                            outlineOffset: 2,
                                            borderRadius: 6,
                                            background: active ? 'rgba(157,123,255,0.08)' : 'transparent',
                                        });
                                        return (
                                            <>
                                                <div
                                                    aria-label="Drag to move the title"
                                                    title="Drag to move the title"
                                                    style={bandStyle(bands.title, draggingText === 'title')}
                                                    onPointerDown={beginTextDrag('title')}
                                                />
                                                {bands.hasCaption && (
                                                    <div
                                                        aria-label="Drag to move the sub-caption"
                                                        title="Drag to move the sub-caption"
                                                        style={bandStyle(bands.caption, draggingText === 'caption')}
                                                        onPointerDown={beginTextDrag('caption')}
                                                    />
                                                )}
                                            </>
                                        );
                                    })()}

                                    {/* Snap guides — center line + bottom-zone line, shown
                                        while the dragged block is magnetically snapped. */}
                                    {draggingText && snapGuides.x && (
                                        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, transform: 'translateX(-0.5px)', background: 'rgba(157,123,255,0.95)', boxShadow: '0 0 4px rgba(157,123,255,0.8)', zIndex: 5, pointerEvents: 'none' }} />
                                    )}
                                    {draggingText && snapGuides.y && (
                                        <div style={{ position: 'absolute', top: `${(ZONE_Y_BOTTOM / CANVAS_H) * 100}%`, left: 0, right: 0, height: 1, transform: 'translateY(-0.5px)', background: 'rgba(157,123,255,0.95)', boxShadow: '0 0 4px rgba(157,123,255,0.8)', zIndex: 5, pointerEvents: 'none' }} />
                                    )}
                                    {draggingText && (
                                        <div
                                            className="absolute top-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-[0.2em] pointer-events-none"
                                            style={{ zIndex: 6, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', color: '#fff' }}
                                        >
                                            Moving {draggingText === 'title' ? 'title' : 'sub-caption'} · release to place
                                        </div>
                                    )}

                                    {busy === 'render' && (
                                        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 7 }}>
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
                                        Drop a photo here, or use &quot;Image source&quot; below to upload / paste a URL.
                                    </span>
                                </div>
                            )}

                            {/* ── Slide pager ──────────────────────────
                                ‹ › arrows page through the slides; one past
                                the last slide is always the "+" add tile.
                                This is the second carousel entry point: from
                                any single picture, next → "+" → upload. */}
                            {(() => {
                                const arrowStyle = (side: 'left' | 'right'): React.CSSProperties => ({
                                    position: 'absolute',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    [side]: 8,
                                    zIndex: 6,
                                    width: 34,
                                    height: 34,
                                    borderRadius: '50%',
                                    background: 'rgba(10,23,48,0.55)',
                                    color: '#fff',
                                    border: '1px solid rgba(255,255,255,0.25)',
                                    backdropFilter: 'blur(4px)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 18,
                                    lineHeight: 1,
                                    cursor: 'pointer',
                                });
                                return (
                                    <>
                                        {(addPane || activeSlide > 0) && (
                                            <button
                                                type="button"
                                                aria-label={addPane ? 'Back to last slide' : 'Previous slide'}
                                                onClick={() => (addPane ? setAddPane(false) : goToSlide(activeSlide - 1))}
                                                style={arrowStyle('left')}
                                            >
                                                ‹
                                            </button>
                                        )}
                                        {!addPane && (
                                            <button
                                                type="button"
                                                aria-label={activeSlide < slides.length - 1 ? 'Next slide' : 'Add a slide'}
                                                title={activeSlide < slides.length - 1 ? 'Next slide' : 'Add a slide'}
                                                onClick={() => {
                                                    if (activeSlide < slides.length - 1) goToSlide(activeSlide + 1);
                                                    else setAddPane(true);
                                                }}
                                                style={arrowStyle('right')}
                                            >
                                                {activeSlide < slides.length - 1 ? '›' : '+'}
                                            </button>
                                        )}
                                        {(slides.length > 1 || addPane) && (
                                            <span
                                                className="absolute top-2 right-2 px-2 py-1 rounded text-[9px] font-bold font-mono pointer-events-none"
                                                style={{ zIndex: 6, background: 'rgba(10,23,48,0.55)', color: '#fff', backdropFilter: 'blur(4px)', letterSpacing: '0.08em' }}
                                            >
                                                {addPane ? `+ / ${slides.length}` : `${activeSlide + 1} / ${slides.length}`}
                                            </span>
                                        )}
                                    </>
                                );
                            })()}

                            {/* Drop-a-photo highlight (desktop drag-and-drop). */}
                            {dropActive && (
                                <div
                                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                                    style={{ zIndex: 8, outline: `2px dashed ${KUMOLAB_PURPLE}`, outlineOffset: -2, background: 'rgba(157,123,255,0.12)', backdropFilter: 'blur(2px)' }}
                                >
                                    <span className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}>
                                        {addPane ? 'Drop to add slides' : 'Drop one photo to replace — several to add slides'}
                                    </span>
                                </div>
                            )}
                        </div>
                        {/* ── Slide strip ──────────────────────────────
                            Thumbnail rail: tap to select, ◀ ▶ to reorder the
                            active slide, duplicate/delete, trailing "+" tile
                            to append slides (multi-select supported). */}
                        <div className="px-3 pt-2.5 pb-2 border-t" style={{ borderColor: 'var(--line)' }}>
                            <div className="flex items-center gap-2 overflow-x-auto pb-1">
                                {syncedSlides().map((sl, i) => {
                                    const active = !addPane && i === activeSlide;
                                    const thumb = sl.sourceUrl || (i === 0 ? (post.image || '') : '');
                                    return (
                                        <button
                                            key={`slide-${i}`}
                                            type="button"
                                            onClick={() => goToSlide(i)}
                                            disabled={!!busy}
                                            title={`Slide ${i + 1} of ${slides.length}`}
                                            className="relative shrink-0 rounded-md overflow-hidden transition-all"
                                            style={{
                                                width: 52,
                                                height: 65,
                                                border: active ? `2px solid ${KUMOLAB_PURPLE}` : '1px solid var(--line-2)',
                                                boxShadow: active ? `0 0 0 2px ${KUMOLAB_PURPLE}33` : 'none',
                                                background: 'var(--surface-2)',
                                                opacity: busy ? 0.6 : 1,
                                            }}
                                        >
                                            {thumb ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={thumb} alt="" className="w-full h-full object-cover" draggable={false} />
                                            ) : (
                                                <span className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: 'var(--text-muted)' }}>·</span>
                                            )}
                                            <span
                                                className="absolute bottom-0.5 left-0.5 px-1 rounded text-[8px] font-bold font-mono"
                                                style={{ background: 'rgba(10,23,48,0.6)', color: '#fff' }}
                                            >
                                                {i + 1}
                                            </span>
                                        </button>
                                    );
                                })}
                                <button
                                    type="button"
                                    onClick={() => addFilesRef.current?.click()}
                                    disabled={!!busy}
                                    title="Add slides — pick one or more photos"
                                    className="shrink-0 rounded-md flex items-center justify-center text-lg font-bold transition-all hover:bg-black/[0.03]"
                                    style={{
                                        width: 52,
                                        height: 65,
                                        border: addPane ? `2px dashed ${KUMOLAB_PURPLE}` : '1px dashed var(--line-2)',
                                        color: addPane ? KUMOLAB_PURPLE : 'var(--ink-3)',
                                        background: addPane ? 'rgba(157,123,255,0.08)' : 'var(--surface-2)',
                                    }}
                                >
                                    +
                                </button>
                            </div>
                            {!addPane && (
                                <div className="flex items-center gap-1.5 mt-1.5">
                                    <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                        Slide {activeSlide + 1}/{slides.length}
                                    </span>
                                    <div className="ml-auto flex items-center gap-1.5">
                                        <NudgeBtn disabled={!!busy || activeSlide === 0} onClick={() => moveActive(-1)}>←</NudgeBtn>
                                        <NudgeBtn disabled={!!busy || activeSlide >= slides.length - 1} onClick={() => moveActive(1)}>→</NudgeBtn>
                                        <button
                                            type="button"
                                            onClick={duplicateActive}
                                            disabled={!!busy}
                                            className="px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all hover:bg-black/[0.03] disabled:cursor-not-allowed"
                                            style={{ background: 'var(--surface-2)', border: '1px solid var(--line-2)', color: 'var(--ink-2)' }}
                                        >
                                            Duplicate
                                        </button>
                                        <button
                                            type="button"
                                            onClick={deleteActive}
                                            disabled={!!busy || slides.length <= 1}
                                            className="px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all hover:bg-black/[0.03] disabled:cursor-not-allowed"
                                            style={{ background: 'var(--surface-2)', border: '1px solid var(--line-2)', color: slides.length <= 1 ? 'var(--ink-3)' : '#c05555' }}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <input
                            ref={addFilesRef}
                            type="file"
                            accept="image/*"
                            multiple
                            disabled={!!busy}
                            className="hidden"
                            onChange={e => {
                                const fs = Array.from(e.target.files || []);
                                if (fs.length) handleAddSlides(fs);
                                e.target.value = '';
                            }}
                        />
                        {settings.applyText && imageUrl && !imageError && !addPane && (
                            <p className="px-4 py-2 text-[10px] border-t" style={{ color: 'var(--text-muted)', borderColor: 'var(--line)' }}>
                                Drag the title or sub-caption directly on the image — they snap to the center and to the bottom caption zone.
                            </p>
                        )}
                    </Card>

                    {/* ── Title — prominent, magazine-style ───────────
                        For a carousel this edits the ACTIVE slide's overlay
                        title; slide 1's title doubles as the post headline
                        (exactly the single-image behavior). */}
                    <Card className="p-5">
                        <label className="block text-[10px] font-bold uppercase tracking-[0.22em] mb-2" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>
                            {slides.length >= 2 ? `Title · slide ${activeSlide + 1}` : 'Title'}
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
                            {slides.length >= 2 && activeSlide > 0
                                ? `Overlay title for slide ${activeSlide + 1} (rendered on that image only). Slide 1's title is the post headline.`
                                : 'Headline on the website + first line of social captions.'}
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

                    {/* Background photo zoom + pan. Scale 1 = cover-fit; the
                        renderer multiplies the fractional pan by the canvas
                        size, so the nudge pad converts px → fractions. */}
                    <ElementControls
                        label="Background image"
                        scale={settings.imageScale}
                        scaleMin={0.5}
                        scaleMax={3}
                        onScaleChange={v => setSettings(s => ({ ...s, imageScale: v }))}
                        offset={{
                            x: Math.round(settings.imagePosition.x * CANVAS_W),
                            y: Math.round(settings.imagePosition.y * CANVAS_H),
                        }}
                        onNudge={(dx, dy) => setSettings(s => ({
                            ...s,
                            imagePosition: { x: s.imagePosition.x + dx / CANVAS_W, y: s.imagePosition.y + dy / CANVAS_H },
                        }))}
                        onRecenter={() => setSettings(s => ({ ...s, imagePosition: { x: 0, y: 0 } }))}
                    />

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
                        onBottom={() => snapToBottom('title')}
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
                        onBottom={() => snapToBottom('caption')}
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

                {/* Sub-section: layout templates — save the current look,
                    apply a saved look to this slide/picture. Templates carry
                    placement + gradient + watermark + scales + image zoom/pan
                    ONLY — never the slide's text, image, or word colors. */}
                <div className="p-5 space-y-3 border-t" style={{ borderColor: 'var(--line)' }}>
                    <div className="flex items-center justify-between gap-2">
                        <SectionLabel>Layout templates</SectionLabel>
                        <button
                            type="button"
                            onClick={saveLayoutTemplate}
                            disabled={!!busy || !!tplBusy}
                            className="ak-btn ak-btn--secondary ak-btn--sm shrink-0"
                        >
                            {tplBusy === 'save' ? 'Saving…' : 'Save current look'}
                        </button>
                    </div>
                    <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                        A template copies this {slides.length >= 2 ? 'slide' : 'picture'}&apos;s placement, gradient, watermark, scales and image zoom — not its text or photo. Apply one to any {slides.length >= 2 ? 'slide' : 'post'} to reuse the look.
                    </p>
                    {tplError && (
                        <div className="text-[10px]" style={{ color: '#ff7777' }}>{tplError}</div>
                    )}
                    {templates.length === 0 ? (
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                            No templates saved yet — style {slides.length >= 2 ? 'a slide' : 'the picture'} the way you like, then hit &quot;Save current look&quot;.
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {templates.map(tpl => {
                                const isApplied = appliedTplId === tpl.id;
                                return (
                                    <div
                                        key={tpl.id}
                                        className="flex items-center gap-2 px-3 py-2 rounded-lg"
                                        style={{
                                            background: 'var(--surface-2)',
                                            border: `1px solid ${isApplied ? KUMOLAB_PURPLE : 'var(--line-2)'}`,
                                        }}
                                    >
                                        <span className="flex-1 min-w-0 truncate text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                                            {tpl.name}
                                        </span>
                                        {isApplied && (
                                            <span className="text-[9px] font-bold uppercase tracking-wider shrink-0" style={{ color: '#6b4fd6' }}>
                                                Applied
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => applyLayoutTemplate(tpl)}
                                            disabled={!!busy || !!tplBusy}
                                            title={slides.length >= 2 ? `Apply this look to slide ${activeSlide + 1}` : 'Apply this look to the picture'}
                                            className="px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all hover:bg-black/[0.03] disabled:cursor-not-allowed shrink-0"
                                            style={{
                                                background: `${KUMOLAB_PURPLE}18`,
                                                border: `1px solid ${KUMOLAB_PURPLE}66`,
                                                color: '#5b3fc4',
                                            }}
                                        >
                                            {slides.length >= 2 ? `Apply to slide ${activeSlide + 1}` : 'Apply'}
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`Delete template ${tpl.name}`}
                                            onClick={() => deleteLayoutTemplate(tpl)}
                                            disabled={!!busy || !!tplBusy}
                                            className="flex items-center justify-center w-6 h-6 rounded text-sm leading-none transition-all hover:bg-black/[0.06] disabled:cursor-not-allowed shrink-0"
                                            style={{ color: 'var(--ink-3)' }}
                                        >
                                            &times;
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Collapsible>
            )}

            {/* ── 5. Image source — open by default so the Upload button
                   is immediately discoverable (fresh-photo entry point). ── */}
            {!isVideoPost && (
            <Collapsible
                title="Image source"
                hint="Replace the background image: upload, paste a URL, or reset to a fresh original"
                defaultOpen
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
    onBottom,
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
    onBottom?: () => void;
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
                {onBottom && (
                    <button
                        onClick={onBottom}
                        disabled={disabled}
                        title="Place in the anime-caption bottom zone"
                        className="px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all hover:bg-black/[0.03] disabled:cursor-not-allowed"
                        style={{
                            background: 'var(--surface-2)',
                            border: '1px solid var(--line-2)',
                            color: 'var(--ink-2)',
                        }}
                    >
                        Bottom
                    </button>
                )}
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
