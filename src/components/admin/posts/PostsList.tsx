'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';

type Post = {
    id: string;
    title: string;
    slug: string;
    status: string | null;
    claim_type?: string | null;
    source?: string | null;
    image?: string | null;
    youtube_video_id?: string | null;
    timestamp?: string | null;
    published_at?: string | null;
    scheduled_post_time?: string | null;
};

type Filter = 'all' | 'pending' | 'approved' | 'published';

const FILTERS: { key: Filter; label: string; accent: string }[] = [
    { key: 'all',       label: 'All',       accent: '#7b61ff' },
    { key: 'pending',   label: 'Pending',   accent: '#ffaa00' },
    { key: 'approved',  label: 'Scheduled', accent: '#00d4ff' },
    { key: 'published', label: 'Published', accent: '#00ff88' },
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
const CLAIM_COLOR: Record<string, string> = {
    TRAILER_DROP: '#ff3cac',
    NEW_KEY_VISUAL: '#7b61ff',
    NEW_SEASON_CONFIRMED: '#00d4ff',
    DATE_ANNOUNCED: '#ffaa00',
    DELAY: '#ff6b35',
    CAST_ADDITION: '#00ff88',
    STAFF_UPDATE: '#00ff88',
    OTHER: '#9ca3af',
};
const STATUS_COLOR: Record<string, string> = {
    pending: '#ffaa00',
    approved: '#00d4ff',
    published: '#00ff88',
    declined: '#9ca3af',
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
    if (p.youtube_video_id) return `https://img.youtube.com/vi/${p.youtube_video_id}/mqdefault.jpg`;
    if (p.image && !p.image.includes('placeholder')) return p.image;
    return null;
}

export default function PostsList({ initialPosts }: { initialPosts: Post[] }) {
    const router = useRouter();
    const [filter, setFilter] = useState<Filter>('all');
    const [aiOpen, setAiOpen] = useState(false);
    const [uploadOpen, setUploadOpen] = useState(false);

    const counts = useMemo(() => {
        const c = { all: initialPosts.length, pending: 0, approved: 0, published: 0 };
        for (const p of initialPosts) {
            if (p.status === 'pending') c.pending++;
            else if (p.status === 'approved') c.approved++;
            else if (p.status === 'published') c.published++;
        }
        return c;
    }, [initialPosts]);

    const visible = useMemo(() => {
        if (filter === 'all') return initialPosts;
        return initialPosts.filter(p => p.status === filter);
    }, [filter, initialPosts]);

    return (
        <div className="max-w-6xl mx-auto space-y-5">
            {/* Header strip */}
            <div className="flex items-end justify-between flex-wrap gap-3">
                <div>
                    <h1
                        className="text-2xl md:text-3xl font-black tracking-tight"
                        style={{
                            fontFamily: 'var(--font-display)',
                            background: 'linear-gradient(135deg, #00d4ff 0%, #7b61ff 50%, #ff3cac 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}
                    >
                        Posts
                    </h1>
                    <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        Click any post to edit · {initialPosts.length} total
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setUploadOpen(true)}
                        className="px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5"
                        style={{
                            background: 'linear-gradient(135deg, rgba(0,212,255,0.18), rgba(0,255,136,0.20))',
                            border: '1px solid rgba(0,212,255,0.35)',
                            color: '#fff',
                            fontFamily: 'var(--font-display)',
                        }}
                    >
                        ↑ Upload
                    </button>
                    <button
                        onClick={() => setAiOpen(true)}
                        className="px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5"
                        style={{
                            background: 'linear-gradient(135deg, rgba(255,60,172,0.18), rgba(123,97,255,0.20))',
                            border: '1px solid rgba(255,60,172,0.35)',
                            color: '#fff',
                            fontFamily: 'var(--font-display)',
                        }}
                    >
                        ✦ AI Assist
                    </button>
                </div>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 flex-wrap">
                {FILTERS.map(f => {
                    const active = filter === f.key;
                    const count = counts[f.key];
                    return (
                        <button
                            key={f.key}
                            onClick={() => setFilter(f.key)}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[0.18em] transition-all flex items-center gap-2"
                            style={{
                                background: active
                                    ? `${f.accent}18`
                                    : 'rgba(255,255,255,0.02)',
                                border: `1px solid ${active ? f.accent + '50' : 'rgba(255,255,255,0.06)'}`,
                                color: active ? f.accent : 'var(--text-tertiary)',
                                fontFamily: 'var(--font-display)',
                            }}
                        >
                            <span>{f.label}</span>
                            <span
                                className="text-[9px] font-mono px-1.5 py-0.5 rounded"
                                style={{ background: active ? `${f.accent}25` : 'rgba(255,255,255,0.04)' }}
                            >
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Posts grid */}
            {visible.length === 0 ? (
                <div className="text-center py-16 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    No posts in this view.
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {visible.map(p => (
                        <PostCard key={p.id} post={p} onClick={() => router.push(`/admin/post/${p.id}`)} />
                    ))}
                </div>
            )}

            {aiOpen && <AiAssistModal onClose={() => setAiOpen(false)} />}
            {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onSuccess={() => { setUploadOpen(false); router.refresh(); }} />}
        </div>
    );
}

function PostCard({ post, onClick }: { post: Post; onClick: () => void }) {
    const claimKey = (post.claim_type || 'OTHER').toUpperCase();
    const claimColor = CLAIM_COLOR[claimKey] || CLAIM_COLOR.OTHER;
    const claimLabel = CLAIM_LABEL[claimKey] || CLAIM_LABEL.OTHER;
    const statusColor = STATUS_COLOR[post.status || ''] || '#9ca3af';
    const thumb = thumbUrl(post);
    const ts = post.published_at || post.scheduled_post_time || post.timestamp;

    return (
        <button
            onClick={onClick}
            className="text-left rounded-xl overflow-hidden transition-all hover:-translate-y-0.5 group"
            style={{
                background: 'rgba(12, 12, 24, 0.55)',
                border: '1px solid rgba(255,255,255,0.06)',
                backdropFilter: 'blur(20px)',
            }}
        >
            <div className="aspect-[4/5] w-full relative overflow-hidden" style={{ background: '#0a0a14' }}>
                {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt={post.title} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                            no image
                        </span>
                    </div>
                )}
                <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-2">
                    <span
                        className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{
                            background: `${claimColor}25`,
                            border: `1px solid ${claimColor}50`,
                            color: claimColor,
                            backdropFilter: 'blur(8px)',
                        }}
                    >
                        {claimLabel}
                    </span>
                    <span
                        className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{
                            background: `${statusColor}25`,
                            border: `1px solid ${statusColor}50`,
                            color: statusColor,
                            backdropFilter: 'blur(8px)',
                        }}
                    >
                        {post.status || '—'}
                    </span>
                </div>
            </div>
            <div className="p-3">
                <p className="text-xs font-semibold leading-snug line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                    {post.title}
                </p>
                <div className="flex items-center justify-between gap-2 mt-2">
                    <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                        {post.source || '—'}
                    </span>
                    {ts && (
                        <span className="text-[9px] font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
                            {timeAgo(ts)}
                        </span>
                    )}
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
        <div
            className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}
            onClick={onClose}
        >
            <div
                onClick={e => e.stopPropagation()}
                className="w-full max-w-lg rounded-t-2xl md:rounded-2xl overflow-hidden"
                style={{
                    background: 'rgba(12, 12, 24, 0.95)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(24px)',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 60px rgba(123,97,255,0.10)',
                }}
            >
                <div className="p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold uppercase tracking-[0.2em]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                            ✦ AI Assist
                        </h2>
                        <button onClick={onClose} className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                            Close
                        </button>
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        Describe the post in plain language — AI drafts it in KumoLab voice.
                    </p>
                </div>

                <div className="p-5 space-y-4">
                    <textarea
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                        placeholder="e.g. Make a post about Demon Slayer Season 5 trailer dropping today, with a hook about the new Hashira"
                        rows={4}
                        disabled={busy}
                        autoFocus
                        className="w-full bg-black/40 px-4 py-3 rounded-lg text-sm focus:outline-none resize-none"
                        style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}
                    />

                    {error && (
                        <div
                            className="p-3 rounded-lg text-xs"
                            style={{ background: 'rgba(255,68,68,0.10)', border: '1px solid rgba(255,68,68,0.25)', color: '#ff9999' }}
                        >
                            {error}
                        </div>
                    )}

                    {draft && (
                        <div className="p-3 rounded-lg space-y-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(123,97,255,0.20)' }}>
                            <div>
                                <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Title</div>
                                <div className="text-sm font-semibold mt-0.5" style={{ color: 'var(--text-primary)' }}>{draft.title}</div>
                            </div>
                            {draft.content && (
                                <div>
                                    <div className="text-[9px] font-bold uppercase tracking-wider mt-2" style={{ color: 'var(--text-muted)' }}>Content</div>
                                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{draft.content}</div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex gap-2 pt-2">
                        <button
                            onClick={generate}
                            disabled={busy || !prompt.trim()}
                            className="flex-1 px-4 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-40"
                            style={{
                                background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(123,97,255,0.18))',
                                border: '1px solid rgba(123,97,255,0.30)',
                                color: '#fff',
                                fontFamily: 'var(--font-display)',
                            }}
                        >
                            {busy ? 'Working…' : draft ? 'Regenerate' : 'Generate'}
                        </button>
                        {draft && (
                            <button
                                onClick={commit}
                                disabled={busy}
                                className="flex-1 px-4 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-40"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(0,255,136,0.18), rgba(0,212,170,0.10))',
                                    border: '1px solid rgba(0,255,136,0.35)',
                                    color: '#7af0a8',
                                    fontFamily: 'var(--font-display)',
                                }}
                            >
                                Save & Open Editor
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Upload Modal ─────────────────────────────────────────────
//
// Pick a video or image from device, optionally write a title +
// caption + "via @creator" credit, hit Publish. The file uploads
// directly from the browser to Supabase Storage (using the
// authenticated supabase-js client so we bypass Vercel's 4.5 MB
// body limit), then we POST the resulting public URL to the
// upload-and-publish endpoint, which creates the post + fans out
// to IG / FB / Threads via the standard publishToSocials flow.
function UploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState('');
    const [caption, setCaption] = useState('');
    const [credit, setCredit] = useState('');
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{ blogUrl: string; social: any } | null>(null);

    const isVideo = file?.type.startsWith('video/');
    const isImage = file?.type.startsWith('image/');

    async function publish() {
        if (!file) { setError('Pick a video or image file first'); return; }
        if (!isVideo && !isImage) { setError('File must be a video or image'); return; }
        if (!title.trim()) { setError('Title is required'); return; }
        if (!caption.trim()) { setError('Caption is required'); return; }

        setBusy(true);
        setError(null);
        setProgress('Uploading file…');

        try {
            const { supabase } = await import('@/lib/supabase/client');
            const bucket = isVideo ? 'blog-videos' : 'blog-images';
            const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 60) || 'upload';
            const key = `manual-uploads/${Date.now()}-${safeName}`;

            const { error: upErr } = await supabase.storage
                .from(bucket)
                .upload(key, file, { contentType: file.type, upsert: false });
            if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

            const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(key);

            setProgress('Publishing to socials…');
            const res = await fetch('/api/admin/upload-and-publish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mediaUrl: publicUrl,
                    mediaType: isVideo ? 'video' : 'image',
                    title: title.trim() || undefined,
                    caption: caption.trim(),
                    credit: credit.trim() || undefined,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || 'Publish failed');

            setResult({ blogUrl: json.blogUrl, social: json.social || {} });
            setProgress(null);
        } catch (e: any) {
            setError(e?.message || 'Upload/publish failed');
            setProgress(null);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div
            className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)' }}
            onClick={onClose}
        >
            <div
                onClick={e => e.stopPropagation()}
                className="w-full max-w-lg rounded-t-2xl md:rounded-2xl overflow-hidden max-h-[90vh] flex flex-col"
                style={{
                    background: 'rgba(12, 12, 24, 0.95)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(24px)',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 60px rgba(0,212,255,0.10)',
                }}
            >
                <div className="p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold uppercase tracking-[0.2em]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                            ↑ Upload & Publish
                        </h2>
                        <button onClick={onClose} className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                            Close
                        </button>
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        Pushes to website + Instagram + Facebook + Threads in one shot
                    </p>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto">
                    {result ? (
                        <div className="space-y-3">
                            <div className="text-sm font-bold" style={{ color: '#7af0a8' }}>
                                ✓ Published
                            </div>
                            <a href={result.blogUrl} target="_blank" rel="noopener noreferrer" className="block text-xs hover:underline" style={{ color: '#7adfff' }}>
                                {result.blogUrl} ↗
                            </a>
                            {result.social?.instagram_url && (
                                <a href={result.social.instagram_url} target="_blank" rel="noopener noreferrer" className="block text-xs hover:underline" style={{ color: '#ff7ec5' }}>
                                    Instagram ↗
                                </a>
                            )}
                            {result.social?.facebook_url && (
                                <a href={result.social.facebook_url} target="_blank" rel="noopener noreferrer" className="block text-xs hover:underline" style={{ color: '#7adfff' }}>
                                    Facebook ↗
                                </a>
                            )}
                            {result.social?.threads_url && (
                                <a href={result.social.threads_url} target="_blank" rel="noopener noreferrer" className="block text-xs hover:underline" style={{ color: '#a092ff' }}>
                                    Threads ↗
                                </a>
                            )}
                            {result.social?.skipped_reason && (
                                <div className="text-[11px]" style={{ color: '#ffaa00' }}>
                                    Social skipped: {result.social.skipped_reason}
                                </div>
                            )}
                            <button
                                onClick={onSuccess}
                                className="w-full px-4 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(0,255,136,0.18), rgba(0,212,170,0.10))',
                                    border: '1px solid rgba(0,255,136,0.35)',
                                    color: '#7af0a8',
                                    fontFamily: 'var(--font-display)',
                                }}
                            >
                                Done
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* File picker */}
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-[0.2em] block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                                    Video or Image File
                                </label>
                                <input
                                    type="file"
                                    accept="video/*,image/*"
                                    onChange={e => { setFile(e.target.files?.[0] || null); setError(null); }}
                                    disabled={busy}
                                    className="block w-full text-[11px] file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:uppercase file:tracking-wider file:cursor-pointer"
                                    style={{
                                        color: 'var(--text-secondary)',
                                    }}
                                />
                                {file && (
                                    <div className="text-[10px] mt-1 font-mono" style={{ color: 'var(--text-tertiary)' }}>
                                        {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB · {isVideo ? 'video' : isImage ? 'image' : 'unknown'}
                                    </div>
                                )}
                            </div>

                            {/* Title (required) */}
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-[0.2em] block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                                    Title <span style={{ color: '#ff7777' }}>*</span>
                                </label>
                                <input
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    disabled={busy}
                                    placeholder="The headline for the website blog post"
                                    className="w-full px-3 py-2 rounded-lg text-xs"
                                    style={{
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        color: 'var(--text-primary)',
                                    }}
                                />
                            </div>

                            {/* Caption */}
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-[0.2em] block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                                    Caption
                                </label>
                                <textarea
                                    value={caption}
                                    onChange={e => setCaption(e.target.value)}
                                    disabled={busy}
                                    rows={6}
                                    placeholder="What's the post about? Goes on IG, FB, Threads + the website."
                                    className="w-full px-3 py-2 rounded-lg text-xs"
                                    style={{
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        color: 'var(--text-primary)',
                                        resize: 'vertical',
                                    }}
                                />
                            </div>

                            {/* Credit */}
                            <div>
                                <label className="text-[10px] font-bold uppercase tracking-[0.2em] block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                                    Credit <span style={{ color: 'var(--text-muted)' }}>(optional, will append "via @handle")</span>
                                </label>
                                <input
                                    value={credit}
                                    onChange={e => setCredit(e.target.value)}
                                    disabled={busy}
                                    placeholder="creatorhandle"
                                    className="w-full px-3 py-2 rounded-lg text-xs"
                                    style={{
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        color: 'var(--text-primary)',
                                    }}
                                />
                            </div>

                            {error && (
                                <div className="text-[11px] p-2 rounded" style={{ background: 'rgba(255,68,68,0.10)', border: '1px solid rgba(255,68,68,0.30)', color: '#ff7777' }}>
                                    {error}
                                </div>
                            )}
                            {progress && (
                                <div className="text-[11px] p-2 rounded" style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.20)', color: '#7adfff' }}>
                                    {progress}
                                </div>
                            )}

                            <button
                                onClick={publish}
                                disabled={busy || !file || !title.trim() || !caption.trim()}
                                className="w-full px-4 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-40"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(0,212,255,0.18), rgba(0,255,136,0.20))',
                                    border: '1px solid rgba(0,212,255,0.35)',
                                    color: '#fff',
                                    fontFamily: 'var(--font-display)',
                                }}
                            >
                                {busy ? 'Working…' : 'Publish to Website + IG + FB + Threads'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
