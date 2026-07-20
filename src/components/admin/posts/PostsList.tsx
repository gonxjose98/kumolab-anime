'use client';

import { useRouter } from 'next/navigation';
import { useState, useMemo, useEffect } from 'react';
import { Upload, Sparkles, Pencil, Play, LayoutGrid, List as ListIcon } from 'lucide-react';
import SchedulePicker from '@/components/admin/content/SchedulePicker';

type Post = {
    id: string;
    title: string;
    slug: string;
    status: string | null;
    claim_type?: string | null;
    source?: string | null;
    image?: string | null;
    youtube_video_id?: string | null;
    social_ids?: Record<string, any> | null;
    timestamp?: string | null;
    published_at?: string | null;
    scheduled_post_time?: string | null;
};

type Filter = 'pending' | 'draft' | 'approved' | 'published';

// Drafts live in Studio (Videos/Images), not Content — no Draft tab here.
const FILTERS: { key: Filter; label: string }[] = [
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Scheduled' },
    { key: 'published', label: 'Published' },
];

const CLAIM_LABEL: Record<string, string> = {
    TRAILER_DROP: 'Trailer',
    NEW_KEY_VISUAL: 'Key Visual',
    NEW_SEASON_CONFIRMED: 'New Season',
    DATE_ANNOUNCED: 'Release Date',
    DELAY: 'Delay',
    CAST_ADDITION: 'Cast',
    STAFF_UPDATE: 'Staff',
    OTHER: 'News',
};

function timeAgo(iso: string | null | undefined): string {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return 'just now';
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
}

function thumbUrl(p: Post): string | null {
    // Match what the publisher actually posts. Order:
    //   1. post.image (the AniList/Crunchyroll/uploaded picture that
    //      goes to IG/FB photo / Threads IMAGE flow). This is the
    //      single source of truth for what readers see on socials.
    //   2. YouTube thumbnail — only as a last-resort fallback when
    //      post.image is missing/placeholder.
    if (p.image && !p.image.includes('placeholder')) return p.image;
    if (p.youtube_video_id) return `https://img.youtube.com/vi/${p.youtube_video_id}/mqdefault.jpg`;
    return null;
}

export default function PostsList({ initialPosts }: { initialPosts: Post[] }) {
    const router = useRouter();
    const [filter, setFilter] = useState<Filter>('pending');
    const [aiOpen, setAiOpen] = useState(false);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [reschedulePost, setReschedulePost] = useState<Post | null>(null);
    const [rescheduleBusy, setRescheduleBusy] = useState(false);
    const [rescheduleError, setRescheduleError] = useState<string | null>(null);
    // List (default) vs the Studio-style card grid. Remembered across visits.
    const [view, setView] = useState<'list' | 'cards'>('list');
    useEffect(() => {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('admin-posts-view') : null;
        if (saved === 'cards' || saved === 'list') setView(saved);
    }, []);
    const chooseView = (v: 'list' | 'cards') => {
        setView(v);
        if (typeof window !== 'undefined') localStorage.setItem('admin-posts-view', v);
    };

    async function saveReschedule(when: Date) {
        if (!reschedulePost) return;
        setRescheduleBusy(true);
        setRescheduleError(null);
        try {
            const res = await fetch('/api/posts', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ id: reschedulePost.id, scheduled_post_time: when.toISOString() }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) throw new Error(json.error || `Reschedule failed (HTTP ${res.status})`);
            setReschedulePost(null);
            router.refresh();
        } catch (e: any) {
            setRescheduleError(e?.message || 'Reschedule failed');
        } finally {
            setRescheduleBusy(false);
        }
    }

    // Remember the active tab across navigation. When you open a post and hit
    // Cancel, the editor does router.back() to this list; restoring the last
    // tab here lands you back on (e.g.) Drafts instead of the default tab.
    useEffect(() => {
        const saved = typeof window !== 'undefined' ? sessionStorage.getItem('admin-posts-tab') : null;
        if (saved && ['pending', 'draft', 'approved', 'published'].includes(saved)) {
            setFilter(saved as Filter);
        }
    }, []);
    useEffect(() => {
        if (typeof window !== 'undefined') sessionStorage.setItem('admin-posts-tab', filter);
    }, [filter]);

    const counts = useMemo(() => {
        const c: Record<Filter, number> = { pending: 0, draft: 0, approved: 0, published: 0 };
        for (const p of initialPosts) {
            if (p.status && p.status in c) c[p.status as Filter]++;
        }
        return c;
    }, [initialPosts]);

    // Each post belongs to exactly one tab by its status.
    const visible = useMemo(
        () => initialPosts.filter(p => p.status === filter),
        [filter, initialPosts],
    );

    return (
        <div className="max-w-6xl mx-auto">
            {/* Header strip */}
            <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
                <p className="ak-caption">Click any post to edit · {initialPosts.length} total</p>
                <div className="flex gap-2">
                    <button className="ak-btn ak-btn--secondary" onClick={() => setUploadOpen(true)}>
                        <Upload size={15} /> Upload
                    </button>
                    <button className="ak-btn ak-btn--primary" onClick={() => setAiOpen(true)}>
                        <Sparkles size={15} /> AI Assist
                    </button>
                </div>
            </div>

            {/* Filter tabs + view toggle */}
            <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginBottom: '16px' }}>
                <div className="ak-pills" style={{ flexWrap: 'wrap' }}>
                    {FILTERS.map(f => {
                        const active = filter === f.key;
                        return (
                            <button
                                key={f.key}
                                onClick={() => setFilter(f.key)}
                                className={`ak-pill ${active ? 'ak-pill--active' : ''}`}
                            >
                                <span>{f.label}</span>
                                <span className="ak-pill__count">{counts[f.key]}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="ak-viewtoggle" role="group" aria-label="View">
                    <button className={view === 'list' ? 'is-on' : ''} onClick={() => chooseView('list')} title="List view" aria-label="List view">
                        <ListIcon size={16} />
                    </button>
                    <button className={view === 'cards' ? 'is-on' : ''} onClick={() => chooseView('cards')} title="Card view" aria-label="Card view">
                        <LayoutGrid size={16} />
                    </button>
                </div>
            </div>

            {/* Posts */}
            {visible.length === 0 ? (
                <div className="ak-empty">
                    <span className="ak-empty__glyph" aria-hidden="true">雲</span>
                    <p className="ak-body-sm">No {FILTERS.find(f => f.key === filter)?.label.toLowerCase()} posts.</p>
                </div>
            ) : view === 'cards' ? (
                <div className="ak-vhub-grid">
                    {visible.map((p) => (
                        <PostCard key={p.id} post={p} onClick={() => router.push(`/admin/post/${p.id}`)} />
                    ))}
                </div>
            ) : (
                <div className="ak-card ak-card--flush">
                    {visible.map((p, i) => (
                        <PostRow
                            key={p.id}
                            post={p}
                            last={i === visible.length - 1}
                            onClick={() => router.push(`/admin/post/${p.id}`)}
                            onReschedule={() => setReschedulePost(p)}
                        />
                    ))}
                </div>
            )}

            {aiOpen && <AiAssistModal onClose={() => setAiOpen(false)} />}
            {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onSuccess={() => { setUploadOpen(false); router.refresh(); }} />}
            {reschedulePost && (
                <SchedulePicker
                    title={reschedulePost.title}
                    initialIso={reschedulePost.scheduled_post_time || new Date().toISOString()}
                    busy={rescheduleBusy}
                    error={rescheduleError}
                    onCancel={() => { setReschedulePost(null); setRescheduleError(null); }}
                    onSave={saveReschedule}
                />
            )}
        </div>
    );
}

// Friendly local date/time for a scheduled slot, e.g. "Jun 2 · 3:00 PM".
function formatSchedule(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).replace(',', ' ·');
}
function PostRow({ post, last, onClick, onReschedule }: { post: Post; last: boolean; onClick: () => void; onReschedule: () => void }) {
    const claimKey = (post.claim_type || 'OTHER').toUpperCase();
    const claimLabel = CLAIM_LABEL[claimKey] || CLAIM_LABEL.OTHER;
    const thumb = thumbUrl(post);
    const isVideo = !!(post.social_ids?.staged_video_url || post.youtube_video_id);
    const isScheduled = post.status === 'approved' && !!post.scheduled_post_time;
    const ts = post.published_at || post.timestamp;

    return (
        <div className="ak-postrow" style={{ borderBottom: last ? 'none' : '1px solid var(--line)' }}>
            {/* Main clickable area → editor */}
            <button onClick={onClick} className="ak-postrow__main">
                <div className="ak-postrow__thumb">
                    {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" />
                    ) : (
                        <span className="ak-postrow__thumbfallback">{isVideo ? <Play size={14} /> : '—'}</span>
                    )}
                    {isVideo && thumb && (
                        <span className="ak-postrow__vidbadge"><Play size={9} fill="currentColor" /></span>
                    )}
                </div>
                <div className="ak-postrow__meta">
                    <p className="ak-postrow__title">{post.title}</p>
                    <p className="ak-postrow__sub">
                        {post.source || '—'}{!isScheduled && ts ? ` · ${timeAgo(ts)}` : ''}
                    </p>
                </div>
            </button>

            {/* Claim type — subtle, hidden on small screens */}
            <span className="ak-postrow__claim">{claimLabel}</span>

            {/* Scheduled posts: tappable slot chip → reschedule. */}
            {isScheduled && (
                <button
                    onClick={(e) => { e.stopPropagation(); onReschedule(); }}
                    title="Tap to change the scheduled date & time"
                    className="ak-badge ak-badge--scheduled ak-postrow__slot"
                >
                    <span suppressHydrationWarning>{formatSchedule(post.scheduled_post_time!)}</span>
                    <Pencil size={11} />
                </button>
            )}
        </div>
    );
}

// Studio-style card for the Content card view (same look as the Studio hubs).
const CARD_STATUS_CLASS: Record<string, string> = {
    pending: 'ak-badge--pending', draft: 'ak-badge--draft', approved: 'ak-badge--scheduled', published: 'ak-badge--published', declined: 'ak-badge--error',
};
const CARD_STATUS_LABEL: Record<string, string> = {
    pending: 'Pending', draft: 'Draft', approved: 'Scheduled', published: 'Published', declined: 'Declined',
};

function PostCard({ post, onClick }: { post: Post; onClick: () => void }) {
    const thumb = thumbUrl(post);
    const isVideo = !!(post.social_ids?.staged_video_url || post.youtube_video_id);
    const ts = post.published_at || post.timestamp;
    const claimKey = (post.claim_type || 'OTHER').toUpperCase();
    return (
        <button className="ak-vhub-card" onClick={onClick}>
            <div className="ak-vhub-thumb">
                {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" />
                ) : (
                    <span className="ak-vhub-thumb__fallback">{isVideo ? <Play size={26} /> : '雲'}</span>
                )}
                <span className="ak-vhub-play">{isVideo ? <Play size={16} fill="currentColor" /> : <Pencil size={14} />}</span>
            </div>
            <div className="ak-vhub-meta">
                <div className="ak-vhub-title">{post.title}</div>
                <div className="ak-vhub-row">
                    {post.status && <span className={`ak-badge ${CARD_STATUS_CLASS[post.status] || 'ak-badge--draft'}`}>{CARD_STATUS_LABEL[post.status] || post.status}</span>}
                    <span className="ak-caption">{CLAIM_LABEL[claimKey] || CLAIM_LABEL.OTHER} · {timeAgo(ts)}</span>
                </div>
            </div>
        </button>
    );
}

function AiAssistModal({ onClose }: { onClose: () => void }) {
    const [prompt, setPrompt] = useState('');
    const [busy, setBusy] = useState(false);
    const [draft, setDraft] = useState<any | null>(null);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    async function generate() {
        if (!prompt.trim()) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/ai-assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || 'AI failed');
            setDraft(json.draft);
        } catch (e: any) {
            setError(e?.message || 'Generation failed');
        } finally {
            setBusy(false);
        }
    }

    async function commit() {
        if (!draft) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post: draft }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || 'Save failed');
            const newId = json.post?.id;
            if (newId) router.push(`/admin/post/${newId}`);
            else { onClose(); router.refresh(); }
        } catch (e: any) {
            setError(e?.message || 'Save failed');
            setBusy(false);
        }
    }

    return (
        <div className="ak-modal__scrim" onClick={onClose}>
            <div className="ak-modal" onClick={e => e.stopPropagation()}>
                <div className="ak-modal__head">
                    <div className="flex items-center gap-2">
                        <Sparkles size={16} style={{ color: 'var(--gold)' }} />
                        <span className="ak-title">AI Assist</span>
                    </div>
                    <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={onClose}>Close</button>
                </div>

                <div className="ak-modal__body">
                    <p className="ak-body-sm" style={{ marginBottom: '14px' }}>
                        Describe the post in plain language. AI drafts it in KumoLab voice.
                    </p>
                    <textarea
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                        placeholder="e.g. Make a post about Demon Slayer Season 5 trailer dropping today, with a hook about the new Hashira"
                        rows={4}
                        disabled={busy}
                        autoFocus
                        className="ak-field__input"
                        style={{ height: 'auto', padding: '12px', resize: 'none' }}
                    />

                    {error && <div className="ak-auth__err" style={{ marginTop: '14px' }}>{error}</div>}

                    {draft && (
                        <div className="ak-card" style={{ marginTop: '16px', background: 'var(--surface-2)' }}>
                            <div className="ak-overline">Title</div>
                            <div className="ak-heading" style={{ marginTop: '2px' }}>{draft.title}</div>
                            {draft.content && (
                                <>
                                    <div className="ak-overline" style={{ marginTop: '12px' }}>Content</div>
                                    <div className="ak-body-sm" style={{ marginTop: '2px' }}>{draft.content}</div>
                                </>
                            )}
                        </div>
                    )}
                </div>
                <div className="ak-modal__foot">
                    <button className="ak-btn ak-btn--secondary" onClick={generate} disabled={busy || !prompt.trim()}>
                        {busy ? 'Working…' : draft ? 'Regenerate' : 'Generate'}
                    </button>
                    {draft && (
                        <button className="ak-btn ak-btn--primary" onClick={commit} disabled={busy}>
                            Save & Open Editor
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Upload Modal ─────────────────────────────────────────────
type UploadPhase = 'idle' | 'uploading' | 'publishing' | 'done';

function PlatformConfirmRow({ icon, label, url, skipped }: { icon: string; label: string; url?: string | null; skipped?: boolean }) {
    if (skipped) {
        return (
            <div className="ak-uprow ak-uprow--skipped">
                <span className="ak-uprow__icon">{icon}</span>
                <span className="ak-body-sm" style={{ flex: 1 }}>{label}</span>
                <span className="ak-caption">not posted</span>
            </div>
        );
    }
    if (!url) return null;
    return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="ak-uprow ak-uprow--link">
            <span className="ak-uprow__icon">{icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ak-body-sm" style={{ fontWeight: 600, color: 'var(--ink)' }}>{label}</div>
                <div className="ak-caption" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {url.replace(/^https?:\/\//, '')}
                </div>
            </div>
            <span style={{ color: 'var(--blue)' }}>↗</span>
        </a>
    );
}

function UploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const router = useRouter();
    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState('');
    const [caption, setCaption] = useState('');
    const [credit, setCredit] = useState('');
    const [phase, setPhase] = useState<UploadPhase>('idle');
    const [phaseStartedAt, setPhaseStartedAt] = useState<number>(0);
    const [now, setNow] = useState<number>(0);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{ blogUrl: string; social: any } | null>(null);

    const busy = phase === 'uploading' || phase === 'publishing';

    useEffect(() => {
        if (!busy) return;
        const id = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(id);
    }, [busy]);

    const isVideo = file?.type.startsWith('video/');
    const isImage = file?.type.startsWith('image/');
    const elapsedSec = phaseStartedAt ? Math.floor((now - phaseStartedAt) / 1000) : 0;

    async function publish() {
        if (!file) { setError('Pick a video or image file first'); return; }
        if (!isVideo && !isImage) { setError('File must be a video or image'); return; }
        if (isVideo) {
            if (!title.trim()) { setError('Title is required'); return; }
            if (!caption.trim()) { setError('Caption is required'); return; }
        }

        setError(null);
        setPhase('uploading');
        setPhaseStartedAt(Date.now());

        try {
            const signRes = await fetch('/api/admin/upload-sign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mediaType: isVideo ? 'video' : 'image', filename: file.name }),
            });
            const sign = await signRes.json();
            if (!signRes.ok || !sign.success) throw new Error(sign.error || 'Could not get upload URL');

            const putRes = await fetch(sign.signedUrl, {
                method: 'PUT',
                body: file,
                headers: { 'Content-Type': file.type, 'x-upsert': 'false' },
            });
            if (!putRes.ok) {
                const detail = await putRes.text().catch(() => '');
                throw new Error(`Upload failed: HTTP ${putRes.status} ${detail.slice(0, 120)}`);
            }

            setPhase('publishing');
            setPhaseStartedAt(Date.now());

            const res = await fetch('/api/admin/upload-and-publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mediaUrl: sign.publicUrl,
                    mediaType: isVideo ? 'video' : 'image',
                    title: title.trim(),
                    caption: caption.trim(),
                    credit: credit.trim() || undefined,
                    mode: isImage ? 'draft' : 'publish',
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || 'Upload failed');

            if (isImage && json.editorUrl) {
                onClose();
                router.push(json.editorUrl);
                return;
            }

            setResult({ blogUrl: json.blogUrl, social: json.social || {} });
            setPhase('done');
        } catch (e: any) {
            setError(e?.message || 'Upload/publish failed');
            setPhase('idle');
        }
    }

    return (
        <div className="ak-modal__scrim" onClick={onClose}>
            <div className="ak-modal" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                <div className="ak-modal__head">
                    <div className="flex items-center gap-2">
                        <Upload size={16} style={{ color: 'var(--blue)' }} />
                        <span className="ak-title">Upload & Publish</span>
                    </div>
                    <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={onClose}>Close</button>
                </div>

                <div className="ak-modal__body" style={{ overflowY: 'auto' }}>
                    <p className="ak-body-sm" style={{ marginBottom: '16px' }}>
                        {isImage
                            ? 'Image uploads open in the editor: set overlays, toggle Convert-to-Reel, then Approve.'
                            : 'Video uploads publish straight to website + Instagram + Facebook + Threads.'}
                    </p>

                    {result ? (
                        <div className="flex flex-col gap-3">
                            <div className="text-center" style={{ padding: '8px 0' }}>
                                <div style={{ fontSize: '30px' }}>✅</div>
                                <div className="ak-heading" style={{ color: '#1d7a4f', marginTop: '4px' }}>Successfully posted</div>
                                <div className="ak-caption" style={{ marginTop: '2px' }}>Tap any link below to open the post</div>
                            </div>
                            <PlatformConfirmRow icon="🌐" label="Website" url={result.blogUrl} />
                            <PlatformConfirmRow icon="📷" label="Instagram" url={result.social?.instagram_url} skipped={!result.social?.instagram_url} />
                            <PlatformConfirmRow icon="📘" label="Facebook" url={result.social?.facebook_url} skipped={!result.social?.facebook_url} />
                            <PlatformConfirmRow icon="🧵" label="Threads" url={result.social?.threads_url} skipped={!result.social?.threads_url} />
                            {result.social?.skipped_reason && (
                                <div className="ak-merch__warn" style={{ color: '#8a6420', background: '#fdf3e0', borderColor: '#ecd9ae' }}>
                                    Note: socials skipped, {result.social.skipped_reason}
                                </div>
                            )}
                            <button className="ak-btn ak-btn--primary ak-btn--block" onClick={onSuccess}>Done</button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {/* File picker */}
                            <div className="ak-field">
                                <label className="ak-field__label">Video or image file</label>
                                <input
                                    type="file"
                                    accept="video/*,image/*"
                                    onChange={e => { setFile(e.target.files?.[0] || null); setError(null); }}
                                    disabled={busy}
                                    className="ak-body-sm"
                                    style={{ color: 'var(--ink-2)' }}
                                />
                                {file && (
                                    <span className="ak-caption" style={{ marginTop: '4px' }}>
                                        {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB · {isVideo ? 'video' : isImage ? 'image' : 'unknown'}
                                    </span>
                                )}
                            </div>

                            {isImage && (
                                <div className="ak-card" style={{ background: 'var(--blue-soft)', borderColor: '#bcd4f2', padding: '14px' }}>
                                    <div className="ak-body-sm" style={{ fontWeight: 600, color: '#1d5cb4' }}>→ Continues to the editor</div>
                                    <div className="ak-caption" style={{ marginTop: '4px' }}>
                                        After upload you&apos;ll get the full editing toolset: title, caption, text overlay,
                                        gradient, watermark, layout nudge, convert-to-Reel toggle, upload swap. Approve from
                                        there to publish to all 4 destinations.
                                    </div>
                                </div>
                            )}

                            {!isImage && (
                                <div className="ak-field">
                                    <label className="ak-field__label">Title <span style={{ color: 'var(--sun)' }}>*</span></label>
                                    <input
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        disabled={busy}
                                        placeholder="The headline for the website blog post"
                                        className="ak-field__input"
                                    />
                                </div>
                            )}

                            {!isImage && (
                                <div className="ak-field">
                                    <label className="ak-field__label">Caption</label>
                                    <textarea
                                        value={caption}
                                        onChange={e => setCaption(e.target.value)}
                                        disabled={busy}
                                        rows={6}
                                        placeholder="What's the post about? Goes on IG, FB, Threads + the website."
                                        className="ak-field__input"
                                        style={{ height: 'auto', padding: '12px', resize: 'vertical' }}
                                    />
                                </div>
                            )}

                            {!isImage && (
                                <div className="ak-field">
                                    <label className="ak-field__label">Credit <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--ink-3)' }}>(optional, appends &quot;via @handle&quot;)</span></label>
                                    <input
                                        value={credit}
                                        onChange={e => setCredit(e.target.value)}
                                        disabled={busy}
                                        placeholder="creatorhandle"
                                        className="ak-field__input"
                                    />
                                </div>
                            )}

                            {error && <div className="ak-auth__err">{error}</div>}

                            {busy && (
                                <div className="ak-card" style={{ background: 'var(--blue-soft)', borderColor: '#bcd4f2', padding: '14px' }}>
                                    <div className="flex items-center gap-2.5">
                                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: 'var(--blue)', animation: 'livePulse 1s ease-in-out infinite' }} />
                                        <span className="ak-body-sm" style={{ fontWeight: 600, color: '#1d5cb4' }}>
                                            {phase === 'uploading' ? 'Uploading file to KumoLab' : 'Publishing to all platforms'}
                                        </span>
                                        <span className="ak-caption" style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{elapsedSec}s</span>
                                    </div>
                                    <div className="ak-caption" style={{ marginTop: '8px' }}>
                                        {phase === 'uploading'
                                            ? `Sending ${file?.name} (${((file?.size || 0) / 1024 / 1024).toFixed(1)} MB) to storage…`
                                            : 'Creating post + pushing to Instagram, Facebook, and Threads. Videos take 1-3 minutes to process.'}
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={publish}
                                disabled={busy || !file || (!isImage && (!title.trim() || !caption.trim()))}
                                className="ak-btn ak-btn--primary ak-btn--block"
                            >
                                {busy ? 'Working…' : isImage ? 'Upload & Continue to Editor' : 'Publish to Website + IG + FB + Threads'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
