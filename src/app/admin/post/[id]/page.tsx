'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface Settings {
    applyText: boolean;
    applyGradient: boolean;
    applyWatermark: boolean;
    gradientPosition: 'top' | 'bottom';
}

const DEFAULT_SETTINGS: Settings = {
    applyText: true,
    applyGradient: true,
    applyWatermark: true,
    gradientPosition: 'bottom',
};

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
                setSourceUrl(data.source_url || '');
                setImageUrl(data.image || '');
                // Mark initial load complete on the next tick so the
                // settings-change effect doesn't fire a render while we're
                // populating defaults from the just-loaded post.
                setTimeout(() => { initialLoadDone.current = true; }, 50);
            } catch (e: any) {
                setError(e?.message || 'Post not found');
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [id]);

    // Live-render: re-run the renderer ~1.2s after the user changes any
    // toggle or gradient position. Cancels prior timer on each change so
    // rapid clicks coalesce into a single render at the end.
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
    }, [settings.applyText, settings.applyGradient, settings.applyWatermark, settings.gradientPosition]);

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
        const action = opts.thenApprove ? 'approve' : 'save';
        setBusy(action);
        setError(null);
        try {
            const res = await fetch('/api/posts', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ id, title, excerpt, content, image: imageUrl }),
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

    async function handleRegenerate(opts: { silent?: boolean } = {}) {
        setBusy('render');
        if (!opts.silent) setError(null);
        setImageError(null);
        try {
            // Persist current title/excerpt FIRST so the live blog post page +
            // any future render request sees the same values. Skip if the
            // editor fields are unchanged (avoid redundant write).
            const dbTitle = post?.title ?? '';
            const dbExcerpt = post?.excerpt ?? '';
            if (title !== dbTitle || excerpt !== dbExcerpt || content !== (post?.content ?? '')) {
                await fetch('/api/posts', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ id, title, excerpt, content }),
                }).catch(() => {});
            }

            // Render with the LIVE editor state. The endpoint uses these
            // overrides as the anime-title and overlay-text, ignoring the DB
            // copy. So toggling Show Text + typing in Caption + Regenerate
            // reflects exactly what the user just typed.
            const json = await callJson('/api/admin/render-post-image', {
                postId: id,
                sourceUrl: sourceUrl || undefined,
                title,
                excerpt,
                settings,
            });
            // Cache-bust so the <img> reloads even if URL is the same.
            const fresh = `${json.image}${json.image.includes('?') ? '&' : '?'}t=${Date.now()}`;
            setImageUrl(fresh);
            // Mirror the freshly-saved fields so subsequent regen calls compare cleanly.
            setPost((p: any) => p ? { ...p, title, excerpt, content, image: json.image } : p);
        } catch (e: any) {
            setError(e?.message || 'Render failed');
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
                            Edits apply on blur · toggles below apply instantly
                        </p>
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

                            <div className="pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
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
                <Field label="Source URL" hint="Used as the render source (also drives video extraction for trailers)">
                    <input
                        type="text"
                        value={sourceUrl}
                        onChange={e => setSourceUrl(e.target.value)}
                        placeholder="https://… (raw image or article URL)"
                        className="w-full bg-black/40 px-4 py-3 rounded-lg text-sm font-mono focus:outline-none"
                        style={{ border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-primary)' }}
                    />
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
