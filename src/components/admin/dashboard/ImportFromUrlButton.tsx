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
import { Plus } from 'lucide-react';

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
            <button onClick={() => setOpen(true)} className="ak-btn ak-btn--secondary ak-btn--sm">
                <Plus size={13} /> Import from URL
            </button>

            {open && (
                <div className="ak-modal__scrim" onClick={closeModal}>
                    <div className="ak-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="ak-modal__head">
                            <span className="ak-title">Import from URL</span>
                            <button type="button" className="ak-btn ak-btn--ghost ak-btn--sm" onClick={closeModal} disabled={busy}>Close</button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            <div className="ak-modal__body flex flex-col gap-4">
                                <p className="ak-body-sm">
                                    Paste an X or Instagram post link. We&apos;ll download the video and
                                    draft a title and caption for you to review.
                                </p>

                                <div className="ak-field">
                                    <label className="ak-field__label">Post URL</label>
                                    <input
                                        type="url"
                                        value={url}
                                        onChange={(e) => setUrl(e.target.value)}
                                        disabled={busy}
                                        placeholder="https://x.com/… or https://www.instagram.com/p/…"
                                        className="ak-field__input"
                                        autoFocus
                                    />
                                </div>

                                <div className="ak-field">
                                    <label className="ak-field__label">Notes for AI <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--ink-3)' }}>(optional)</span></label>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        disabled={busy}
                                        placeholder="e.g. MAPPA dropping Chainsaw S2 ED preview"
                                        rows={2}
                                        className="ak-field__input"
                                        style={{ height: 'auto', padding: '12px', resize: 'none' }}
                                    />
                                </div>

                                {error && <div className="ak-auth__err">{error}</div>}

                                {busy && (
                                    <div className="ak-body-sm flex items-center gap-2" style={{ color: '#1d5cb4', background: 'var(--blue-soft)', border: '1px solid #bcd4f2', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
                                        <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                        {step === 'downloading' && 'Downloading video…'}
                                        {step === 'drafting' && 'Generating title + caption…'}
                                    </div>
                                )}

                                {step === 'done' && (
                                    <div className="ak-body-sm" style={{ color: '#1d7a4f', background: '#e2f4ea', border: '1px solid #b9e0c9', borderRadius: 'var(--r-md)', padding: '10px 12px' }}>
                                        Imported, opening editor…
                                    </div>
                                )}

                                <p className="ak-caption">
                                    Imports skip duplicate detection. You&apos;re curating. They land as
                                    pending; nothing publishes until you approve in the editor.
                                </p>
                            </div>

                            <div className="ak-modal__foot">
                                <button type="button" onClick={closeModal} disabled={busy} className="ak-btn ak-btn--secondary">Cancel</button>
                                <button type="submit" disabled={busy || !url.trim()} className="ak-btn ak-btn--primary">
                                    {busy ? '…' : 'Import'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
