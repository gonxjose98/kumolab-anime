'use client';

/**
 * FindVideoButton
 *
 * Sits next to Approve/Decline on each pending row. Opens a modal where
 * the operator can search YouTube for the video version of a
 * screenshot-only pending post (e.g. a "S2 Opening" announcement that
 * came in as a still image), pick a ranked candidate, and download it
 * via the existing yt-dlp worker. On success the existing pending row
 * is enriched with social_ids.staged_video_url and the operator is
 * redirected to the editor to trim before approving.
 *
 * Backend split:
 *   /api/admin/scrape-search → ranked candidates (YouTube Data API)
 *   /api/admin/scrape-attach → download MP4 + UPDATE the pending row
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

type Step = 'idle' | 'searching' | 'results' | 'downloading' | 'done';

type Risk = { type: 'ok' | 'warn' | 'bad'; label: string };

interface Candidate {
    videoId: string;
    url: string;
    title: string;
    channelTitle: string;
    durationText: string;
    durationSeconds: number;
    viewCount: number;
    publishedAt: string;
    thumbnailUrl: string;
    score: number;
    pros: string[];
    risks: Risk[];
}

function compactViews(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K views`;
    return `${n} views`;
}

// Strip news-article fluff from a post title so the pre-filled YouTube
// search isn't poisoned by milestone phrasing ("Reaches 100M Streams")
// or boilerplate verbs ("Reveals", "Announces"). Empirically: leaving
// these in returns 0 ytsearch results; stripping them returns the
// official OP/trailer on the first try.
function cleanQueryForSearch(title: string): string {
    let s = title
        .replace(/['"‘’“”]/g, '')          // smart + plain quotes
        .replace(/\s*\([^)]*\)/g, '')                          // (parentheticals)
        .replace(/\s*\[[^\]]*\]/g, '')                         // [brackets]
        // milestone tails: "Reaches 100 Million Streams", "Tops 1B Views"
        .replace(
            /\b(reaches|tops|hits|crosses|cracks|surpasses|breaks|passes|smashes)\s+[\d.,]+\s*(million|billion|trillion|m|b|k|thousand)?\s*(streams?|views?|copies|downloads?|plays?|sales?|fans?|subscribers?|followers?).*$/i,
            '',
        )
        // leading verbs: "Reveals", "Announces", "Drops" — usually subject-less filler
        .replace(/^\s*(reveals?|announces?|drops?|unveils?|debuts?|teases?|confirms?|shows off)\s+/i, '')
        // trailing colons / hyphens with article-style continuations
        .replace(/[—–:|]\s*[^—–:|]{0,40}$/i, '')
        ;
    return s.replace(/\s+/g, ' ').trim();
}

function relativeAge(iso: string): string {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return 'upcoming';
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    if (ms < 30 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
    return `${Math.floor(ms / (30 * 86_400_000))}mo ago`;
}

export default function FindVideoButton({
    postId,
    postTitle,
}: {
    postId: string;
    postTitle: string;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [query, setQuery] = useState(cleanQueryForSearch(postTitle));

    // The dashboard's pending-review Card uses backdrop-filter: blur(),
    // which makes it a containing block for position:fixed descendants.
    // Without a portal the modal would anchor inside the Card instead
    // of the viewport — its footer overlapped the "Next 24 Hours" and
    // "Recently Published" sections below. Portal to document.body so
    // the modal sits at the top of the stacking context.
    useEffect(() => setMounted(true), []);
    const [step, setStep] = useState<Step>('idle');
    const [error, setError] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);

    function reset() {
        setQuery(cleanQueryForSearch(postTitle));
        setStep('idle');
        setError(null);
        setCandidates([]);
        setSelectedVideoId(null);
    }

    function closeModal() {
        if (step === 'searching' || step === 'downloading') return;
        setOpen(false);
        reset();
    }

    async function runSearch(e?: React.FormEvent) {
        if (e) e.preventDefault();
        if (!query.trim()) {
            setError('Query is empty');
            return;
        }
        setError(null);
        setStep('searching');
        setCandidates([]);
        setSelectedVideoId(null);
        try {
            const res = await fetch('/api/admin/scrape-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ postId, query: query.trim() }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) {
                throw new Error(json.error || `Search failed (HTTP ${res.status})`);
            }
            const list: Candidate[] = json.candidates || [];
            setCandidates(list);
            setSelectedVideoId(list[0]?.videoId ?? null);
            setStep('results');
        } catch (err: any) {
            setError(err?.message || 'Search failed');
            setStep('idle');
        }
    }

    async function confirmAttach() {
        const picked = candidates.find((c) => c.videoId === selectedVideoId);
        if (!picked) {
            setError('Pick a candidate first');
            return;
        }
        setError(null);
        setStep('downloading');
        try {
            const res = await fetch('/api/admin/scrape-attach', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ postId, youtubeUrl: picked.url }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) {
                throw new Error(json.error || `Attach failed (HTTP ${res.status})`);
            }
            setStep('done');
            setTimeout(() => {
                router.push(json.editorUrl);
                router.refresh();
            }, 400);
        } catch (err: any) {
            setError(err?.message || 'Attach failed');
            setStep('results');
        }
    }

    const busy = step === 'searching' || step === 'downloading';

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="ak-btn ak-btn--secondary ak-btn--sm flex-1 sm:flex-none justify-center whitespace-nowrap"
                title="Find a YouTube video to attach to this pending post"
            >
                <Search size={13} /> Find Video
            </button>

            {open && mounted && createPortal(
                <div className="admin-root"><div className="ak-modal__scrim" onClick={closeModal}>
                    <div
                        className="ak-modal p-5 md:p-6 flex flex-col"
                        style={{
                            maxWidth: '672px',
                            // dvh handles iPhone's collapsing-URL-bar correctly;
                            // svh fallback for browsers that don't support dvh.
                            maxHeight: 'min(90svh, 90dvh)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="ak-title mb-1">Find Video</h2>
                        <p className="ak-body-sm mb-4">
                            Search YouTube for the video version of this post. The top match
                            is pre-selected. Override if it isn&apos;t right. We&apos;ll download
                            it and attach to this pending row for trimming.
                        </p>

                        <form onSubmit={runSearch}>
                            <div className="ak-field">
                                <label className="ak-field__label">Search query</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        disabled={busy}
                                        placeholder="e.g. Apothecary Diaries Season 2 opening"
                                        className="ak-field__input flex-1"
                                        autoFocus
                                    />
                                    <button
                                        type="submit"
                                        disabled={busy || !query.trim()}
                                        className="ak-btn ak-btn--primary"
                                    >
                                        {step === 'searching' ? '…' : 'Search'}
                                    </button>
                                </div>
                            </div>
                        </form>

                        {error && <div className="ak-auth__err mt-3" style={{ textAlign: 'left' }}>{error}</div>}

                        {step === 'searching' && (
                            <div className="text-[11px] px-3 py-2 rounded-md flex items-center gap-2 mt-3" style={{ background: 'var(--blue-soft)', border: '1px solid #bcd4f2', color: '#1d5cb4' }}>
                                <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                Searching YouTube…
                            </div>
                        )}

                        {step === 'results' && candidates.length === 0 && (
                            <div className="text-[11px] px-3 py-2 rounded-md mt-3" style={{ background: '#fdf3e0', border: '1px solid #ecd9ae', color: '#8a6420' }}>
                                No matches. Try refining the query.
                            </div>
                        )}

                        {(step === 'results' || step === 'downloading' || step === 'done') &&
                            candidates.length > 0 && (
                                <div className="mt-3 flex-1 overflow-y-auto -mx-1 px-1">
                                    <ul className="space-y-2">
                                        {candidates.map((c) => (
                                            <CandidateRow
                                                key={c.videoId}
                                                c={c}
                                                selected={c.videoId === selectedVideoId}
                                                onSelect={() => !busy && setSelectedVideoId(c.videoId)}
                                            />
                                        ))}
                                    </ul>
                                </div>
                            )}

                        {step === 'downloading' && (
                            <div className="text-[11px] px-3 py-2 rounded-md flex items-center gap-2 mt-3" style={{ background: 'var(--blue-soft)', border: '1px solid #bcd4f2', color: '#1d5cb4' }}>
                                <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                Downloading video via worker (up to 60s if worker is cold)…
                            </div>
                        )}

                        {step === 'done' && (
                            <div className="text-[11px] px-3 py-2 rounded-md mt-3" style={{ background: '#e2f4ea', border: '1px solid #b9e0c9', color: '#1d7a4f' }}>
                                Attached, opening editor…
                            </div>
                        )}

                        <div className="flex gap-2 justify-end pt-3 mt-3 shrink-0" style={{ borderTop: '1px solid var(--line)' }}>
                            <button type="button" onClick={closeModal} disabled={busy} className="ak-btn ak-btn--secondary ak-btn--sm">
                                Cancel
                            </button>
                            {step === 'results' && candidates.length > 0 && (
                                <button
                                    type="button"
                                    onClick={confirmAttach}
                                    disabled={busy || !selectedVideoId}
                                    className="ak-btn ak-btn--primary ak-btn--sm"
                                >
                                    Use this video
                                </button>
                            )}
                        </div>
                    </div>
                </div></div>,
                document.body,
            )}
        </>
    );
}

function CandidateRow({
    c,
    selected,
    onSelect,
}: {
    c: Candidate;
    selected: boolean;
    onSelect: () => void;
}) {
    const hasBad = c.risks.some((r) => r.type === 'bad');
    const borderColor = selected
        ? 'var(--blue)'
        : hasBad
            ? '#f0c4be'
            : 'var(--line-2)';
    const bg = selected ? 'var(--blue-soft)' : 'var(--surface)';

    return (
        <li>
            <div
                role="button"
                tabIndex={0}
                onClick={onSelect}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect();
                    }
                }}
                className="w-full text-left flex gap-3 p-2.5 rounded-lg transition-all cursor-pointer"
                style={{ background: bg, border: `1px solid ${borderColor}` }}
            >
                {c.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={c.thumbnailUrl}
                        alt=""
                        className="w-24 h-14 rounded object-cover shrink-0"
                        style={{ border: '1px solid var(--line)' }}
                    />
                ) : (
                    <div className="w-24 h-14 rounded shrink-0" style={{ background: 'var(--surface-2)' }} />
                )}
                <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold leading-snug line-clamp-2" style={{ color: 'var(--ink)' }}>
                        {c.title}
                    </div>
                    <div className="text-[10px] mt-1 flex items-center gap-1.5 flex-wrap" style={{ color: 'var(--ink-3)' }}>
                        <span>{c.channelTitle || 'unknown channel'}</span>
                        <span>·</span>
                        <span>{c.durationText}</span>
                        <span>·</span>
                        <span>{compactViews(c.viewCount)}</span>
                        {c.publishedAt && (
                            <>
                                <span>·</span>
                                <span>{relativeAge(c.publishedAt)}</span>
                            </>
                        )}
                    </div>
                    {(c.pros.length > 0 || c.risks.length > 0) && (
                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                            {c.pros.map((p, i) => (
                                <span
                                    key={`p-${i}`}
                                    className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                                    style={{ background: '#e2f4ea', border: '1px solid #b9e0c9', color: '#1d7a4f' }}
                                >
                                    ✓ {p}
                                </span>
                            ))}
                            {c.risks.map((r, i) => {
                                const color = r.type === 'bad' ? '#b03328' : '#8a6420';
                                const bgc = r.type === 'bad' ? '#fbe9e7' : '#fdf3e0';
                                const bc = r.type === 'bad' ? '#f0c4be' : '#ecd9ae';
                                return (
                                    <span
                                        key={`r-${i}`}
                                        className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                                        style={{ background: bgc, border: `1px solid ${bc}`, color }}
                                    >
                                        ✗ {r.label}
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>
                <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="ak-btn ak-btn--secondary ak-btn--sm shrink-0 self-start"
                    title="Open on YouTube"
                >
                    Watch ↗
                </a>
            </div>
        </li>
    );
}
