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
                className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5"
                style={{
                    background: 'linear-gradient(135deg, rgba(0,212,255,0.18), rgba(123,97,255,0.10))',
                    border: '1px solid rgba(0,212,255,0.35)',
                    color: '#7be0ff',
                    fontFamily: 'var(--font-display)',
                }}
                title="Find a YouTube video to attach to this pending post"
            >
                🔍 Find Video
            </button>

            {open && mounted && createPortal(
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
                    onClick={closeModal}
                >
                    <div
                        className="rounded-2xl p-5 md:p-6 w-full max-w-2xl flex flex-col"
                        style={{
                            background: 'rgba(18, 18, 30, 0.95)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            boxShadow: '0 12px 48px rgba(0,0,0,0.5)',
                            // dvh handles iPhone's collapsing-URL-bar correctly;
                            // svh fallback for browsers that don't support dvh.
                            maxHeight: 'min(90svh, 90dvh)',
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
                            Find Video
                        </h2>
                        <p className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>
                            Search YouTube for the video version of this post. The top match
                            is pre-selected — override if it isn&apos;t right. We&apos;ll download
                            it and attach to this pending row for trimming.
                        </p>

                        <form onSubmit={runSearch} className="space-y-3">
                            <div>
                                <label
                                    className="block text-[10px] font-bold uppercase tracking-wider mb-1"
                                    style={{
                                        color: 'var(--text-secondary)',
                                        fontFamily: 'var(--font-display)',
                                    }}
                                >
                                    Search query
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        disabled={busy}
                                        placeholder="e.g. Apothecary Diaries Season 2 opening"
                                        className="flex-1 px-3 py-2 rounded-md text-sm outline-none"
                                        style={{
                                            background: 'rgba(0,0,0,0.4)',
                                            border: '1px solid rgba(255,255,255,0.10)',
                                            color: 'var(--text-primary)',
                                        }}
                                        autoFocus
                                    />
                                    <button
                                        type="submit"
                                        disabled={busy || !query.trim()}
                                        className="px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                                        style={{
                                            background: 'linear-gradient(135deg, rgba(0,212,255,0.30), rgba(123,97,255,0.20))',
                                            border: '1px solid rgba(0,212,255,0.50)',
                                            color: '#a3eaff',
                                            fontFamily: 'var(--font-display)',
                                        }}
                                    >
                                        {step === 'searching' ? '…' : 'Search'}
                                    </button>
                                </div>
                            </div>
                        </form>

                        {error && (
                            <div
                                className="text-[11px] px-3 py-2 rounded-md mt-3"
                                style={{
                                    background: 'rgba(255,68,68,0.10)',
                                    border: '1px solid rgba(255,68,68,0.30)',
                                    color: '#ff8888',
                                }}
                            >
                                {error}
                            </div>
                        )}

                        {step === 'searching' && (
                            <div
                                className="text-[11px] px-3 py-2 rounded-md flex items-center gap-2 mt-3"
                                style={{
                                    background: 'rgba(0,212,255,0.08)',
                                    border: '1px solid rgba(0,212,255,0.25)',
                                    color: '#7be0ff',
                                }}
                            >
                                <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                Searching YouTube…
                            </div>
                        )}

                        {step === 'results' && candidates.length === 0 && (
                            <div
                                className="text-[11px] px-3 py-2 rounded-md mt-3"
                                style={{
                                    background: 'rgba(255,170,0,0.08)',
                                    border: '1px solid rgba(255,170,0,0.25)',
                                    color: '#ffd88a',
                                }}
                            >
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
                            <div
                                className="text-[11px] px-3 py-2 rounded-md flex items-center gap-2 mt-3"
                                style={{
                                    background: 'rgba(0,212,255,0.08)',
                                    border: '1px solid rgba(0,212,255,0.25)',
                                    color: '#7be0ff',
                                }}
                            >
                                <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
                                Downloading video via worker (up to 60s if worker is cold)…
                            </div>
                        )}

                        {step === 'done' && (
                            <div
                                className="text-[11px] px-3 py-2 rounded-md mt-3"
                                style={{
                                    background: 'rgba(0,255,136,0.10)',
                                    border: '1px solid rgba(0,255,136,0.30)',
                                    color: '#7af0a8',
                                }}
                            >
                                Attached — opening editor…
                            </div>
                        )}

                        <div
                            className="flex gap-2 justify-end pt-3 mt-3 shrink-0"
                            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                        >
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
                            {step === 'results' && candidates.length > 0 && (
                                <button
                                    type="button"
                                    onClick={confirmAttach}
                                    disabled={busy || !selectedVideoId}
                                    className="px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{
                                        background:
                                            'linear-gradient(135deg, rgba(0,255,136,0.30), rgba(0,212,170,0.20))',
                                        border: '1px solid rgba(0,255,136,0.50)',
                                        color: '#a3ffce',
                                        fontFamily: 'var(--font-display)',
                                    }}
                                >
                                    Use this video
                                </button>
                            )}
                        </div>
                    </div>
                </div>,
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
        ? 'rgba(0,212,255,0.55)'
        : hasBad
            ? 'rgba(255,68,68,0.18)'
            : 'rgba(255,255,255,0.08)';
    const bg = selected ? 'rgba(0,212,255,0.06)' : 'rgba(255,255,255,0.02)';

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
                        style={{ border: '1px solid rgba(255,255,255,0.06)' }}
                    />
                ) : (
                    <div
                        className="w-24 h-14 rounded shrink-0"
                        style={{ background: 'rgba(255,255,255,0.04)' }}
                    />
                )}
                <div className="flex-1 min-w-0">
                    <div
                        className="text-[12px] font-semibold leading-snug line-clamp-2"
                        style={{ color: 'var(--text-primary)' }}
                    >
                        {c.title}
                    </div>
                    <div
                        className="text-[10px] mt-1 flex items-center gap-1.5 flex-wrap"
                        style={{ color: 'var(--text-muted)' }}
                    >
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
                                    style={{
                                        background: 'rgba(0,255,136,0.10)',
                                        border: '1px solid rgba(0,255,136,0.30)',
                                        color: '#7af0a8',
                                    }}
                                >
                                    ✓ {p}
                                </span>
                            ))}
                            {c.risks.map((r, i) => {
                                const color = r.type === 'bad' ? '#ff8888' : '#ffd88a';
                                const bgc = r.type === 'bad' ? 'rgba(255,68,68,0.10)' : 'rgba(255,170,0,0.10)';
                                const bc = r.type === 'bad' ? 'rgba(255,68,68,0.30)' : 'rgba(255,170,0,0.30)';
                                return (
                                    <span
                                        key={`r-${i}`}
                                        className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                                        style={{
                                            background: bgc,
                                            border: `1px solid ${bc}`,
                                            color,
                                        }}
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
                    className="shrink-0 self-start px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5"
                    style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        color: '#7be0ff',
                        fontFamily: 'var(--font-display)',
                        textDecoration: 'none',
                    }}
                    title="Open on YouTube"
                >
                    Watch ↗
                </a>
            </div>
        </li>
    );
}
