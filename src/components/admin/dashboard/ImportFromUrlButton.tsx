'use client';

/**
 * ImportFromUrlButton
 *
 * Operator workflow: paste an X (twitter.com / x.com) or Instagram post URL,
 * optionally add a one-line editorial brief, and let the server
 *   (1) download the video into the blog-videos bucket via yt-dlp,
 *   (2) draft a KumoLab-voice title + caption from the original post text
 *       plus the operator's notes,
 *   (3) insert a pending post and return its editor URL.
 *
 * On success we redirect to /admin/post/[id] where the operator can edit
 * title/caption, toggle overlays, and approve. Approval pushes the post
 * into the standard scheduled-publish flow.
 *
 * On failure (especially IG auth walls) we surface the error inline.
 * No fallbacks — per Jose's directive, broken IG downloads should fail
 * loudly so the operator falls back to manual upload deliberately.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Step = 'idle' | 'downloading' | 'drafting' | 'done';

export default function ImportFromUrlButton() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [url, setUrl] = useState('');
    const [notes, setNotes] = useState('');
    const [step, setStep] = useState<Step>('idle');
    const [error, setError] = useState<string | null>(null);

    function reset() {
        setUrl('');
        setNotes('');
        setStep('idle');
        setError(null);
    }

    function closeModal() {
        if (step !== 'idle' && step !== 'done') return; // don't close mid-import
        setOpen(false);
        reset();
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!url.trim()) {
            setError('URL is required');
            return;
        }
        setError(null);
        setStep('downloading');

        // The server runs both steps (download then AI draft) inside the
        // same request — we can't observe the transition from the client.
        // Flip to 'drafting' on a timer so the user sees progress moving
        // forward instead of staring at the same label for ~30s.
        const draftTimer = setTimeout(() => setStep('drafting'), 8_000);

        try {
            const res = await fetch('/api/admin/import-from-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ url: url.trim(), notes: notes.trim() }),
            });
            clearTimeout(draftTimer);
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) {
                throw new Error(json.error || `Import failed (HTTP ${res.status})`);
            }
            setStep('done');
            // Brief "Done" flash then jump to the editor.
            setTimeout(() => {
                router.push(json.editorUrl);
                router.refresh();
            }, 400);
        } catch (e: any) {
            clearTimeout(draftTimer);
            setError(e?.message || 'Import failed');
            setStep('idle');
        }
    }

    const busy = step !== 'idle' && step !== 'done';

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5"
                style={{
                    background: 'linear-gradient(135deg, rgba(0,212,255,0.18), rgba(123,97,255,0.10))',
                    border: '1px solid rgba(0,212,255,0.35)',
                    color: '#7be0ff',
                    fontFamily: 'var(--font-display)',
                }}
            >
                + Import from URL
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
                    onClick={closeModal}
                >
                    <div
                        className="rounded-2xl p-6 w-full max-w-lg"
                        style={{
                            background: 'rgba(18, 18, 30, 0.95)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2
                            className="text-lg font-black tracking-tight mb-1"
                            style={{
                                fontFamily: 'var(--font-display)',
                                background: 'linear-gradient(135deg, #00d4ff, #7b61ff)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                            }}
                        >
                            Import from URL
                        </h2>
                        <p className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>
                            Paste an X or Instagram post link. We&apos;ll download the video and
                            draft a title and caption for you to review.
                        </p>

                        <form onSubmit={handleSubmit} className="space-y-3">
                            <div>
                                <label
                                    className="block text-[10px] font-bold uppercase tracking-wider mb-1"
                                    style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}
                                >
                                    Post URL
                                </label>
                                <input
                                    type="url"
                                    value={url}
                                    onChange={(e) => setUrl(e.target.value)}
                                    disabled={busy}
                                    placeholder="https://x.com/… or https://www.instagram.com/p/…"
                                    className="w-full px-3 py-2 rounded-md text-sm outline-none"
                                    style={{
                                        background: 'rgba(0,0,0,0.4)',
                                        border: '1px solid rgba(255,255,255,0.10)',
                                        color: 'var(--text-primary)',
                                    }}
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label
                                    className="block text-[10px] font-bold uppercase tracking-wider mb-1"
                                    style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}
                                >
                                    Notes for AI <span style={{ color: 'var(--text-muted)' }}>(optional)</span>
                                </label>
                                <textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    disabled={busy}
                                    placeholder="e.g. MAPPA dropping Chainsaw S2 ED preview"
                                    rows={2}
                                    className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none"
                                    style={{
                                        background: 'rgba(0,0,0,0.4)',
                                        border: '1px solid rgba(255,255,255,0.10)',
                                        color: 'var(--text-primary)',
                                    }}
                                />
                            </div>

                            {error && (
                                <div
                                    className="text-[11px] px-3 py-2 rounded-md"
                                    style={{
                                        background: 'rgba(255,68,68,0.10)',
                                        border: '1px solid rgba(255,68,68,0.30)',
                                        color: '#ff8888',
                                    }}
                                >
                                    {error}
                                </div>
                            )}

                            {busy && (
                                <div
                                    className="text-[11px] px-3 py-2 rounded-md flex items-center gap-2"
                                    style={{
                                        background: 'rgba(0,212,255,0.08)',
                                        border: '1px solid rgba(0,212,255,0.25)',
                                        color: '#7be0ff',
                                    }}
                                >
                                    <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                    {step === 'downloading' && 'Downloading video…'}
                                    {step === 'drafting' && 'Generating title + caption…'}
                                </div>
                            )}

                            {step === 'done' && (
                                <div
                                    className="text-[11px] px-3 py-2 rounded-md"
                                    style={{
                                        background: 'rgba(0,255,136,0.10)',
                                        border: '1px solid rgba(0,255,136,0.30)',
                                        color: '#7af0a8',
                                    }}
                                >
                                    Imported, opening editor…
                                </div>
                            )}

                            <div className="flex gap-2 justify-end pt-2">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    disabled={busy}
                                    className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-40"
                                    style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.10)',
                                        color: 'var(--text-secondary)',
                                        fontFamily: 'var(--font-display)',
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={busy || !url.trim()}
                                    className="px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(0,212,255,0.30), rgba(123,97,255,0.20))',
                                        border: '1px solid rgba(0,212,255,0.50)',
                                        color: '#a3eaff',
                                        fontFamily: 'var(--font-display)',
                                    }}
                                >
                                    {busy ? '…' : 'Import'}
                                </button>
                            </div>
                        </form>

                        <p
                            className="text-[10px] mt-4"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            Imports skip duplicate detection. You&apos;re curating. They land as
                            pending; nothing publishes until you approve in the editor.
                        </p>
                    </div>
                </div>
            )}
        </>
    );
}
