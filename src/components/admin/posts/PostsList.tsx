'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useMemo, useEffect } from 'react';

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

const FILTERS: { key: Filter; label: string; accent: string }[] = [
    { key: 'pending',   label: 'Pending',   accent: '#ffaa00' },
    { key: 'draft',     label: 'Draft',     accent: '#a78bfa' },
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
    //      post.image is missing/placeholder. Avoids the desync where
    //      the admin tile showed the YT thumb but IG actually posted
    //      the AniList cover (different art for the same anime).
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

    // Remember the active tab across navigation. When you open a post and hit
    // Cancel, the editor does router.back() to this list; restoring the last
    // tab here lands you back on (e.g.) Drafts instead of the default tab.
    // Initialised in an effect (not the useState initialiser) to avoid an SSR
    // hydration mismatch — the server has no sessionStorage.
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

    // Each post belongs to exactly one tab by its status — nothing shows in
    // more than one place (no more "All" catch-all).
    const visible = useMemo(
        () => initialPosts.filter(p => p.status === filter),
        [filter, initialPosts],
    );

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

            {/* Posts list — compact, scannable rows */}
            {visible.length === 0 ? (
                <div className="text-center py-16 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    No {FILTERS.find(f => f.key === filter)?.label.toLowerCase()} posts.
                </div>
            ) : (
                <div
                    className="rounded-xl overflow-hidden"
                    style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(12,12,24,0.45)', backdropFilter: 'blur(20px)' }}
                >
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
                <RescheduleModal
                    post={reschedulePost}
                    onClose={() => setReschedulePost(null)}
                    onSaved={() => { setReschedulePost(null); router.refresh(); }}
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
// ISO (UTC) → value for <input type="datetime-local"> in the operator's local tz.
function toLocalInputValue(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PostRow({ post, last, onClick, onReschedule }: { post: Post; last: boolean; onClick: () => void; onReschedule: () => void }) {
    const claimKey = (post.claim_type || 'OTHER').toUpperCase();
    const claimColor = CLAIM_COLOR[claimKey] || CLAIM_COLOR.OTHER;
    const claimLabel = CLAIM_LABEL[claimKey] || CLAIM_LABEL.OTHER;
    const thumb = thumbUrl(post);
    const isVideo = !!(post.social_ids?.staged_video_url || post.youtube_video_id);
    const isScheduled = post.status === 'approved' && !!post.scheduled_post_time;
    // Time shown in the meta line. Scheduled posts show their slot in a
    // tappable chip on the right instead (a future scheduled_post_time would
    // read as "just now" here), so the meta is just the source.
    const ts = post.published_at || post.timestamp;

    return (
        <div
            className="group w-full flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/[0.035]"
            style={{ borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.05)' }}
        >
            {/* Main clickable area → editor */}
            <button onClick={onClick} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                <div
                    className="relative shrink-0 rounded-md overflow-hidden"
                    style={{ width: 46, height: 46, background: '#0a0a14', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                    {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
                            {isVideo ? '▶' : '—'}
                        </div>
                    )}
                    {isVideo && thumb && (
                        <span
                            className="absolute bottom-0.5 right-0.5 text-[7px] leading-none px-1 py-0.5 rounded"
                            style={{ background: 'rgba(0,0,0,0.6)', color: '#fff' }}
                        >
                            ▶
                        </span>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold leading-snug truncate" style={{ color: 'var(--text-primary)' }}>
                        {post.title}
                    </p>
                    <p className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {post.source || '—'}{!isScheduled && ts ? ` · ${timeAgo(ts)}` : ''}
                    </p>
                </div>
            </button>

            {/* Claim type — subtle, hidden on small screens */}
            <span
                className="hidden sm:inline text-[9px] font-bold uppercase tracking-wider shrink-0"
                style={{ color: claimColor }}
            >
                {claimLabel}
            </span>

            {/* Scheduled posts: tappable slot chip → reschedule. (No redundant
                status tag — the tab already says the status.) */}
            {isScheduled && (
                <button
                    onClick={(e) => { e.stopPropagation(); onReschedule(); }}
                    title="Tap to change the scheduled date & time"
                    className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold transition-all hover:-translate-y-0.5"
                    style={{ background: 'rgba(0,212,255,0.10)', border: '1px solid rgba(0,212,255,0.30)', color: '#7adfff' }}
                >
                    <span suppressHydrationWarning>{formatSchedule(post.scheduled_post_time!)}</span>
                    <span style={{ opacity: 0.7 }}>✎</span>
                </button>
            )}
        </div>
    );
}

function RescheduleModal({ post, onClose, onSaved }: { post: Post; onClose: () => void; onSaved: () => void }) {
    const [value, setValue] = useState(post.scheduled_post_time ? toLocalInputValue(post.scheduled_post_time) : '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function save() {
        if (!value) { setError('Pick a date & time'); return; }
        const when = new Date(value);
        if (isNaN(when.getTime())) { setError('Invalid date & time'); return; }
        setBusy(true);
        setError(null);
        try {
            const res = await fetch('/api/posts', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ id: post.id, scheduled_post_time: when.toISOString() }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) throw new Error(json.error || `Reschedule failed (HTTP ${res.status})`);
            onSaved();
        } catch (e: any) {
            setError(e?.message || 'Reschedule failed');
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
                className="w-full max-w-sm rounded-t-2xl md:rounded-2xl overflow-hidden"
                style={{ background: 'rgba(12, 12, 24, 0.97)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(24px)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}
            >
                <div className="p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold uppercase tracking-[0.2em]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                            Reschedule
                        </h2>
                        <button onClick={onClose} className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                            Close
                        </button>
                    </div>
                    <p className="text-[11px] mt-1 truncate" style={{ color: 'var(--text-muted)' }}>{post.title}</p>
                </div>
                <div className="p-5 space-y-4">
                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-[0.2em] block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                            Publish date & time
                        </label>
                        <input
                            type="datetime-local"
                            value={value}
                            disabled={busy}
                            onChange={e => { setValue(e.target.value); setError(null); }}
                            className="w-full px-3 py-2.5 rounded-lg text-sm"
                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--text-primary)', colorScheme: 'dark' }}
                        />
                        <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                            Your local time. The post publishes on the next cron tick after this.
                        </p>
                    </div>
                    {error && (
                        <div className="text-[11px] p-2 rounded" style={{ background: 'rgba(255,68,68,0.10)', border: '1px solid rgba(255,68,68,0.30)', color: '#ff7777' }}>
                            {error}
                        </div>
                    )}
                    <div className="flex gap-2 pt-1">
                        <button
                            onClick={onClose}
                            disabled={busy}
                            className="px-4 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-40"
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={save}
                            disabled={busy || !value}
                            className="flex-1 px-4 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-40"
                            style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.20), rgba(123,97,255,0.18))', border: '1px solid rgba(0,212,255,0.40)', color: '#fff', fontFamily: 'var(--font-display)' }}
                        >
                            {busy ? 'Saving…' : 'Save schedule'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
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
type UploadPhase = 'idle' | 'uploading' | 'publishing' | 'done';

function PlatformConfirmRow({ icon, label, url, accent, skipped }: { icon: string; label: string; url?: string | null; accent: string; skipped?: boolean }) {
    if (skipped) {
        return (
            <div
                className="flex items-center gap-3 p-3 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', opacity: 0.5 }}
            >
                <span className="text-base">{icon}</span>
                <span className="text-[11px] font-semibold flex-1" style={{ color: 'var(--text-muted)' }}>{label}</span>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>not posted</span>
            </div>
        );
    }
    if (!url) return null;
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-lg transition-all hover:translate-x-0.5"
            style={{ background: `${accent}10`, border: `1px solid ${accent}40` }}
        >
            <span className="text-base">{icon}</span>
            <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold" style={{ color: '#fff' }}>{label}</div>
                <div className="text-[9px] truncate font-mono" style={{ color: accent }}>{url.replace(/^https?:\/\//, '')}</div>
            </div>
            <span style={{ color: accent }}>↗</span>
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

    // Tick a clock so the elapsed-time readout updates while we're working
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
        // Title and caption only required for VIDEO uploads (which
        // immediately publish). Image uploads route to the editor where
        // those fields get filled in.
        if (isVideo) {
            if (!title.trim()) { setError('Title is required'); return; }
            if (!caption.trim()) { setError('Caption is required'); return; }
        }

        setError(null);
        setPhase('uploading');
        setPhaseStartedAt(Date.now());

        try {
            // Step 1: signed upload URL.
            const signRes = await fetch('/api/admin/upload-sign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mediaType: isVideo ? 'video' : 'image',
                    filename: file.name,
                }),
            });
            const sign = await signRes.json();
            if (!signRes.ok || !sign.success) throw new Error(sign.error || 'Could not get upload URL');

            // Step 2: PUT to Supabase storage.
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

            // Step 3: branch on media type:
            //   image → create as DRAFT, redirect to /admin/post/[id]
            //           so the operator gets the full editor
            //           (overlays, convertToReel, layout, etc.)
            //   video → publish IMMEDIATELY (current flow). Videos
            //           don't need the overlay editor.
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
                // Send the operator straight to the editor. They'll set
                // title + caption + overlays + convertToReel toggle and
                // hit Approve from there.
                onClose();
                router.push(json.editorUrl);
                return;
            }

            // Video path — landed on socials directly.
            setResult({ blogUrl: json.blogUrl, social: json.social || {} });
            setPhase('done');
        } catch (e: any) {
            setError(e?.message || 'Upload/publish failed');
            setPhase('idle');
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
                        {isImage
                            ? 'Image uploads open in the editor — set overlays, toggle Convert-to-Reel, then Approve'
                            : 'Video uploads publish straight to website + Instagram + Facebook + Threads'}
                    </p>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto">
                    {result ? (
                        <div className="space-y-4">
                            <div className="text-center py-3">
                                <div className="text-3xl mb-2">✅</div>
                                <div className="text-sm font-bold" style={{ color: '#7af0a8', fontFamily: 'var(--font-display)' }}>
                                    SUCCESSFULLY POSTED
                                </div>
                                <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                                    Tap any link below to open the post
                                </div>
                            </div>

                            <PlatformConfirmRow icon="🌐" label="Website" url={result.blogUrl} accent="#7adfff" />
                            <PlatformConfirmRow
                                icon="📷"
                                label="Instagram"
                                url={result.social?.instagram_url}
                                accent="#ff7ec5"
                                skipped={!result.social?.instagram_url}
                            />
                            <PlatformConfirmRow
                                icon="📘"
                                label="Facebook"
                                url={result.social?.facebook_url}
                                accent="#7adfff"
                                skipped={!result.social?.facebook_url}
                            />
                            <PlatformConfirmRow
                                icon="🧵"
                                label="Threads"
                                url={result.social?.threads_url}
                                accent="#a092ff"
                                skipped={!result.social?.threads_url}
                            />
                            {result.social?.skipped_reason && (
                                <div className="text-[11px] p-2 rounded" style={{ background: 'rgba(255,170,0,0.10)', border: '1px solid rgba(255,170,0,0.30)', color: '#ffcc66' }}>
                                    Note: socials skipped — {result.social.skipped_reason}
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

                            {/* For IMAGE uploads: skip the inline title/caption/credit
                                fields entirely — those go in the editor. Show a brief
                                explainer instead so the operator knows what's coming. */}
                            {isImage && (
                                <div
                                    className="p-3 rounded-lg text-[11px]"
                                    style={{
                                        background: 'rgba(0,212,255,0.06)',
                                        border: '1px solid rgba(0,212,255,0.20)',
                                        color: '#7adfff',
                                    }}
                                >
                                    <div className="font-semibold mb-1">→ Continues to the editor</div>
                                    <div style={{ color: 'var(--text-muted)' }}>
                                        After upload you'll get the full editing toolset:
                                        title · caption · text overlay · gradient · watermark ·
                                        layout nudge · convert-to-Reel toggle · upload swap.
                                        Approve from there to publish to all 4 destinations.
                                    </div>
                                </div>
                            )}

                            {/* Title (required for VIDEO only — image uploads use the editor) */}
                            {!isImage && (
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
                            )}

                            {/* Caption (only for VIDEO — images set caption in editor) */}
                            {!isImage && (
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
                            )}

                            {/* Credit (only for VIDEO — images set in editor) */}
                            {!isImage && (
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
                            )}

                            {error && (
                                <div className="text-[11px] p-2 rounded" style={{ background: 'rgba(255,68,68,0.10)', border: '1px solid rgba(255,68,68,0.30)', color: '#ff7777' }}>
                                    {error}
                                </div>
                            )}

                            {busy && (
                                <div
                                    className="p-3 rounded-lg space-y-2"
                                    style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.25)' }}
                                >
                                    <div className="flex items-center gap-2.5">
                                        <span className="inline-block w-3 h-3 rounded-full" style={{
                                            background: '#7adfff',
                                            animation: 'livePulse 1s ease-in-out infinite',
                                        }} />
                                        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#7adfff', fontFamily: 'var(--font-display)' }}>
                                            {phase === 'uploading' ? 'Uploading file to KumoLab' : 'Publishing to all platforms'}
                                        </span>
                                        <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                            {elapsedSec}s
                                        </span>
                                    </div>
                                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                                        {phase === 'uploading'
                                            ? `Sending ${file?.name} (${((file?.size || 0) / 1024 / 1024).toFixed(1)} MB) to storage…`
                                            : phase === 'publishing'
                                                ? 'Creating post + pushing to Instagram, Facebook, and Threads. Videos take 1–3 minutes for the platforms to process.'
                                                : ''}
                                    </div>
                                    <div
                                        className="h-0.5 rounded-full overflow-hidden"
                                        style={{ background: 'rgba(255,255,255,0.06)' }}
                                    >
                                        <div
                                            className="h-full"
                                            style={{
                                                width: '40%',
                                                background: 'linear-gradient(90deg, transparent, #7adfff, transparent)',
                                                animation: 'shimmer 1.5s linear infinite',
                                            }}
                                        />
                                    </div>
                                    <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                                        Don&apos;t close this window — it&apos;s working.
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={publish}
                                disabled={busy || !file || (!isImage && (!title.trim() || !caption.trim()))}
                                className="w-full px-4 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-40"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(0,212,255,0.18), rgba(0,255,136,0.20))',
                                    border: '1px solid rgba(0,212,255,0.35)',
                                    color: '#fff',
                                    fontFamily: 'var(--font-display)',
                                }}
                            >
                                {busy
                                    ? 'Working…'
                                    : isImage
                                        ? 'Upload & Continue to Editor'
                                        : 'Publish to Website + IG + FB + Threads'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
