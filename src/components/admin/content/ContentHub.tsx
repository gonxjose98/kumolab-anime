'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
    ChevronDown, ChevronLeft, ChevronRight, Clapperboard, ExternalLink, Film, Folder, GalleryHorizontal,
    Link2, Plus, Search, Sparkles, Star, Upload, X,
} from 'lucide-react';
// Type-only: lib/content/hub pulls in the service-role client.
import type { ContentHubData, ContentRow, ContentView } from '@/lib/content/hub';
import { KindIcon, PLATFORM_LABEL, isOptimizable } from './scheduleUi';
import ScheduleSlotButton from './ScheduleSlotButton';
import SchedulePreview from './SchedulePreview';
import DownloadMediaButton from './DownloadMediaButton';
import { AiAssistModal, UploadModal } from './ContentModals';
import ImportFromUrlButton from '@/components/admin/dashboard/ImportFromUrlButton';
import MediaPickerModal from '@/components/admin/studio/MediaPickerModal';
import StudioActivityStats from '@/components/admin/studio/StudioActivityStats';

/*
 * Content: everything we post, in one place (the old Content + Studio tabs).
 *
 * Four views by status, each grouped by ET day with times on every card:
 *   Posted (default)  newest first; what went out, ready to save for TikTok
 *   Up next           soonest first; empty days stay visible so gaps show
 *   To review         pending, newest first; tap to open the editor
 *   Drafts            work in progress, last edited first; tap to keep editing
 * Every card has Download and a Studio button. Live posts (scheduled or posted)
 * open in Studio as an editable copy, so the original is never touched.
 */

const VIEWS: { key: ContentView; label: string }[] = [
    { key: 'posted', label: 'Posted' },
    { key: 'next', label: 'Up next' },
    { key: 'review', label: 'To review' },
    { key: 'drafts', label: 'Drafts' },
];
const VIEW_KEY = 'admin-content-view';
const SOCIAL_KEY = 'admin-content-socials-only';

const ET = 'America/New_York';
const etDayKey = (t: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const keyToDate = (key: string) => new Date(`${key}T12:00:00Z`);
const addDays = (key: string, n: number) => {
    const d = keyToDate(key);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
const fmtKey = (key: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...o }).format(keyToDate(key));

/** What a post publishes: the reel MP4, every carousel slide, or the single image. */
const mediaUrls = (r: ContentRow) => (r.videoUrl ? [r.videoUrl] : r.slides.length ? r.slides : r.cover ? [r.cover] : []);
const isLive = (r: ContentRow) => r.status === 'approved' || r.status === 'published';
const editorUrl = (id: string, video: boolean) => (video ? `/admin/post/${id}/studio` : `/admin/post/${id}`);

function kindBadge(r: ContentRow): string {
    if (r.kind === 'carousel') return `Carousel · ${r.slides.length}`;
    if (r.videoUrl) return 'Reel';
    return r.kind === 'video' ? 'Video' : 'Image';
}

/** Open a post in Studio: drafts/pending in place, live posts as a fresh draft copy. */
function useStudio() {
    const router = useRouter();
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    async function open(r: ContentRow) {
        setError(null);
        if (!isLive(r)) { router.push(editorUrl(r.id, !!r.videoUrl)); return; }
        setBusyId(r.id);
        try {
            const res = await fetch('/api/admin/studio/duplicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ postId: r.id }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) throw new Error(json.error || `Copy failed (HTTP ${res.status})`);
            router.push(editorUrl(json.id, json.kind === 'video'));
        } catch (e: any) {
            setError(e?.message || 'Could not make an editable copy');
            setBusyId(null);
        }
    }
    return { open, busyId, error, clearError: () => setError(null) };
}

export default function ContentHub({ data, initialView, newCarousel }: {
    data: ContentHubData;
    initialView: ContentView | null;
    newCarousel: { topic: string } | null;
}) {
    const router = useRouter();
    const studio = useStudio();
    const [view, setView] = useState<ContentView>(initialView ?? 'posted');
    const [q, setQ] = useState('');
    const [socialsOnly, setSocialsOnly] = useState(true);
    const [previewId, setPreviewId] = useState<string | null>(null);
    const [modal, setModal] = useState<'carousel' | 'import' | 'upload' | 'ai' | null>(newCarousel ? 'carousel' : null);
    const [jump, setJump] = useState<string | null>(null);
    const [todayKey] = useState(() => etDayKey(Date.now()));

    // Restore the last view (the editor's Back lands on plain /admin/content) and filter.
    useEffect(() => {
        try {
            if (!initialView) {
                const v = sessionStorage.getItem(VIEW_KEY) as ContentView | null;
                if (v && VIEWS.some((x) => x.key === v)) setView(v);
            }
            if (localStorage.getItem(SOCIAL_KEY) === '0') setSocialsOnly(false);
        } catch { /* storage blocked: defaults are fine */ }
        // A deep link (?view= / ?new=) has done its job; keep refreshes clean.
        if (initialView || newCarousel) window.history.replaceState(null, '', '/admin/content');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const chooseView = (v: ContentView) => {
        setView(v);
        try { sessionStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
    };
    const chooseSocials = (on: boolean) => {
        setSocialsOnly(on);
        try { localStorage.setItem(SOCIAL_KEY, on ? '1' : '0'); } catch { /* ignore */ }
    };

    const needle = q.trim().toLowerCase();
    const lists = useMemo(() => {
        const match = (r: ContentRow) => !needle || r.title.toLowerCase().includes(needle) || (r.caption || '').toLowerCase().includes(needle);
        return {
            posted: data.posted.filter((r) => match(r) && (!socialsOnly || r.social)),
            next: data.next.filter(match),
            review: data.review.filter(match),
            drafts: data.drafts.filter(match),
        } as Record<ContentView, ContentRow[]>;
    }, [data, needle, socialsOnly]);
    const siteOnlyCount = data.posted.filter((r) => !r.social).length;

    const rows = lists[view];
    const groups = useMemo(() => {
        const byDay = new Map<string, ContentRow[]>();
        for (const r of rows) {
            const list = byDay.get(r.dayKey) ?? [];
            list.push(r);
            byDay.set(r.dayKey, list);
        }
        if (view !== 'next' || needle) return [...byDay.entries()].map(([key, items]) => ({ key, items }));
        // Up next: every day from today to the last slot, so empty days show as gaps.
        const keys = [...byDay.keys()].sort();
        const last = keys.length && keys[keys.length - 1] > todayKey ? keys[keys.length - 1] : todayKey;
        const out: { key: string; items: ContentRow[] }[] = [];
        for (let k = keys[0] && keys[0] < todayKey ? keys[0] : todayKey; k <= last && out.length < 60; k = addDays(k, 1)) {
            out.push({ key: k, items: byDay.get(k) ?? [] });
        }
        return out;
    }, [rows, view, needle, todayKey]);

    // Calendar jump: once the target view has rendered, scroll to that day.
    useEffect(() => {
        if (!jump) return;
        const el = document.getElementById(`ch-day-${jump}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            el.classList.add('is-flash');
            setTimeout(() => el.classList.remove('is-flash'), 1400);
        }
        setJump(null);
    }, [jump, groups]);

    function pickDay(key: string) {
        const future = key >= todayKey && data.next.some((r) => r.dayKey === key);
        if (future) { chooseView('next'); setQ(''); setJump(key); return; }
        const posted = data.posted.filter((r) => r.dayKey === key);
        if (!posted.length) return;
        if (socialsOnly && !posted.some((r) => r.social)) chooseSocials(false);
        chooseView('posted'); setQ(''); setJump(key);
    }

    const all = [...data.posted, ...data.next, ...data.review, ...data.drafts];
    const preview = previewId ? all.find((r) => r.id === previewId) ?? null : null;

    function onCard(r: ContentRow) {
        if (r.view === 'posted' || r.view === 'next') setPreviewId(r.id);
        else studio.open(r);
    }

    const dayLabel = (key: string) =>
        key === todayKey ? 'Today' : key === addDays(todayKey, -1) ? 'Yesterday' : key === addDays(todayKey, 1) ? 'Tomorrow' : null;

    return (
        <div className="ak-ch">
            <div className="ak-ch__bar">
                <div className="ak-ch__views" role="tablist" aria-label="Content views">
                    {VIEWS.map((v) => (
                        <button key={v.key} type="button" role="tab" aria-selected={view === v.key}
                            className={`ak-ch__view${view === v.key ? ' is-on' : ''}${v.key === 'review' && data.review.length ? ' has-work' : ''}`}
                            onClick={() => chooseView(v.key)}>
                            {v.label}<span className="ak-ch__count">{lists[v.key].length}</span>
                        </button>
                    ))}
                </div>
                <div className="ak-ch__tools">
                    <label className="ak-ch__search">
                        <Search size={15} aria-hidden="true" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search posts" aria-label="Search posts" />
                        {q && <button type="button" onClick={() => setQ('')} aria-label="Clear search"><X size={14} /></button>}
                    </label>
                    <Link href="/admin/content/media" className="ak-btn ak-btn--secondary ak-btn--sm"><Folder size={14} /> Media</Link>
                    <NewMenu onPick={setModal} />
                </div>
            </div>

            {(data.error || studio.error) && (
                <div className="ak-alert ak-alert--error" role="alert">
                    {studio.error || `Some posts failed to load: ${data.error}`}
                </div>
            )}

            <div className="ak-ch__layout">
                <main className="ak-ch__main">
                    <p className="ak-ch__hint">
                        {view === 'posted' && (socialsOnly
                            ? <>Carousels and reels that went out to socials. <button type="button" onClick={() => chooseSocials(false)}>Show website posts too ({siteOnlyCount})</button></>
                            : <>Everything published, website posts included. <button type="button" onClick={() => chooseSocials(true)}>Socials only</button></>)}
                        {view === 'next' && 'Soonest first. Tap a time to move a post. All times Eastern.'}
                        {view === 'review' && 'Found by the engine and waiting on you. Tap one to review and approve.'}
                        {view === 'drafts' && 'Work in progress, last edited first. Tap one to keep editing.'}
                    </p>

                    {rows.length === 0 ? (
                        <div className="ak-empty">
                            <span className="ak-empty__glyph" aria-hidden="true">雲</span>
                            <p className="ak-body-sm">
                                {needle ? 'Nothing matches your search here.' : view === 'review' ? 'All caught up. Nothing waiting on you.' : view === 'next' ? 'Nothing scheduled.' : view === 'drafts' ? 'No drafts. Start one from New.' : 'Nothing posted yet.'}
                            </p>
                        </div>
                    ) : (
                        // Days flow side by side (a 1-post day doesn't eat a whole row) and wrap.
                        <div className="ak-ch-days">
                        {groups.map(({ key, items }) => (
                            <section key={key} id={`ch-day-${key}`} className={`ak-ch-day${items.length ? '' : ' is-empty'}`}
                                style={{ '--n': Math.max(1, items.length) } as React.CSSProperties}>
                                <header className="ak-ch-day__head">
                                    <h2 className="ak-ch-day__name">
                                        {dayLabel(key) && <span className="ak-ch-day__rel">{dayLabel(key)}</span>}
                                        {fmtKey(key, { weekday: 'short', month: 'short', day: 'numeric' })}
                                    </h2>
                                    <span className="ak-ch-day__count">{items.length ? `${items.length} ${items.length === 1 ? 'post' : 'posts'}` : 'Nothing scheduled'}</span>
                                </header>
                                {items.length > 0 && (
                                    <div className="ak-ch-grid">
                                        {items.map((r) => (
                                            <ContentCard key={r.id} row={r} busy={studio.busyId === r.id}
                                                onOpen={() => onCard(r)} onStudio={() => studio.open(r)} />
                                        ))}
                                    </div>
                                )}
                            </section>
                        ))}
                        </div>
                    )}
                </main>

                <aside className="ak-ch__rail" aria-label="Calendar and next up">
                    <MiniCalendar todayKey={todayKey} posted={data.posted} next={data.next} socialsOnly={socialsOnly} onPick={pickDay} />
                    <NextUp rows={data.next.filter((r) => r.isFuture).slice(0, 4)} onOpen={(r) => setPreviewId(r.id)} onAll={() => chooseView('next')} />
                    <StudioActivityStats />
                </aside>
            </div>

            {preview && (
                <SchedulePreview row={preview} onClose={() => setPreviewId(null)} actions={
                    <>
                        <DownloadMediaButton urls={mediaUrls(preview)} baseName={preview.slug || 'kumolab-post'} label="Download" className="ak-ch-act" />
                        <button type="button" className="ak-ch-act" onClick={() => studio.open(preview)} disabled={studio.busyId === preview.id}
                            title={isLive(preview) ? 'Opens an editable copy. The live post stays as it is.' : 'Open in Studio'}>
                            <Clapperboard size={14} /> {studio.busyId === preview.id ? 'Making a copy…' : isLive(preview) ? 'Edit a copy in Studio' : 'Open in Studio'}
                        </button>
                        {(Object.entries(preview.links) as [string, string][]).map(([k, url]) => (
                            <a key={k} href={url} target="_blank" rel="noopener noreferrer" className="ak-ch-act is-quiet">
                                {k === 'x' ? 'X' : PLATFORM_LABEL[k as keyof typeof PLATFORM_LABEL]} <ExternalLink size={12} />
                            </a>
                        ))}
                    </>
                } />
            )}

            {modal === 'carousel' && <NewCarouselSheet topic={newCarousel?.topic ?? ''} onClose={() => setModal(null)} />}
            {modal === 'import' && <ImportFromUrlButton onClose={() => setModal(null)} />}
            {modal === 'upload' && <UploadModal onClose={() => setModal(null)} onSuccess={() => { setModal(null); router.refresh(); }} />}
            {modal === 'ai' && <AiAssistModal onClose={() => setModal(null)} />}
        </div>
    );
}

function ContentCard({ row: r, busy, onOpen, onStudio }: { row: ContentRow; busy: boolean; onOpen: () => void; onStudio: () => void }) {
    const live = isLive(r);
    return (
        <article className={`ak-ch-card${r.view === 'posted' && !r.social ? ' is-siteonly' : ''}`}>
            <button type="button" className="ak-ch-card__hit" onClick={onOpen} aria-label={`${r.view === 'posted' || r.view === 'next' ? 'Preview' : 'Open'} ${r.title}`}>
                <span className="ak-ch-card__thumb">
                    {r.cover ? (
                        <Image src={r.cover} alt="" fill sizes="(max-width: 700px) 46vw, 220px" unoptimized={!isOptimizable(r.cover)} draggable={false} />
                    ) : (
                        <span className="ak-ch-card__noimg"><KindIcon kind={r.kind} size={22} /></span>
                    )}
                    <span className="ak-ch-card__kind">
                        {r.kind === 'carousel' ? <GalleryHorizontal size={11} /> : r.kind === 'video' ? <Film size={11} /> : null}
                        {kindBadge(r)}
                    </span>
                    {busy && <span className="ak-ch-card__busy">Making a copy…</span>}
                </span>
                <span className="ak-ch-card__title">{r.title}</span>
            </button>
            <div className="ak-ch-card__acts">
                <DownloadMediaButton urls={mediaUrls(r)} baseName={r.slug || 'kumolab-post'} />
                <button type="button" className="ak-ch-card__studio" onClick={onStudio} disabled={busy}
                    title={live ? 'Edit a copy in Studio (the live post stays as it is)' : 'Open in Studio'}
                    aria-label={live ? `Edit a copy of ${r.title} in Studio` : `Open ${r.title} in Studio`}>
                    <Clapperboard size={14} />
                </button>
            </div>
            <div className="ak-ch-card__meta">
                {r.view === 'next' ? (
                    <ScheduleSlotButton id={r.id} title={r.title} iso={r.scheduledPostTime} slotLabel={r.slotLabel} editable={r.isFuture} />
                ) : (
                    <time className="ak-ch-card__time" dateTime={r.scheduledPostTime} suppressHydrationWarning>{r.slotLabel}</time>
                )}
                {r.view === 'next' && r.isPeak && <Star size={11} className="ak-ch-card__peak" aria-label="Peak slot" />}
                <span className="ak-ch-card__where">
                    {r.view === 'posted' && (r.social ? r.platforms.filter((p) => p !== 'website').map((p) => PLATFORM_LABEL[p]).concat(r.links.x ? ['X'] : []).join(' · ') : 'Website only')}
                    {r.view === 'next' && r.platforms.filter((p) => p !== 'website').map((p) => PLATFORM_LABEL[p]).join(' · ')}
                    {r.view === 'review' && r.source}
                    {r.view === 'drafts' && (r.editedBy ? `Edited by ${r.editedBy}` : 'Draft')}
                </span>
            </div>
        </article>
    );
}

function NewMenu({ onPick }: { onPick: (m: 'carousel' | 'import' | 'upload' | 'ai') => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
        const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', down);
        document.addEventListener('keydown', key);
        return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
    }, [open]);
    const items = [
        { key: 'carousel', Icon: GalleryHorizontal, label: 'New carousel', sub: 'From your photos or a Media folder' },
        { key: 'import', Icon: Link2, label: 'Import from a link', sub: 'X or Instagram post, we grab the video' },
        { key: 'upload', Icon: Upload, label: 'Upload a video', sub: 'Publishes to the site and socials' },
        { key: 'ai', Icon: Sparkles, label: 'Write with AI', sub: 'Describe it and AI drafts the post' },
    ] as const;
    return (
        <div className="ak-ch-new" ref={ref}>
            <button type="button" className="ak-btn ak-btn--primary ak-btn--sm" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
                <Plus size={14} /> New <ChevronDown size={13} />
            </button>
            {open && (
                <div className="ak-ch-new__menu" role="menu">
                    {items.map(({ key, Icon, label, sub }) => (
                        <button key={key} type="button" role="menuitem" className="ak-ch-new__item" onClick={() => { setOpen(false); onPick(key); }}>
                            <Icon size={16} aria-hidden="true" />
                            <span><strong>{label}</strong><small>{sub}</small></span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function MiniCalendar({ todayKey, posted, next, socialsOnly, onPick }: {
    todayKey: string; posted: ContentRow[]; next: ContentRow[]; socialsOnly: boolean; onPick: (key: string) => void;
}) {
    const [month, setMonth] = useState(() => todayKey.slice(0, 7));
    const marks = useMemo(() => {
        const m = new Map<string, { posted: number; next: number }>();
        const bump = (k: string, f: 'posted' | 'next') => { const v = m.get(k) ?? { posted: 0, next: 0 }; v[f]++; m.set(k, v); };
        for (const r of posted) if (!socialsOnly || r.social) bump(r.dayKey, 'posted');
        for (const r of next) bump(r.dayKey, 'next');
        return m;
    }, [posted, next, socialsOnly]);
    const first = `${month}-01`;
    const lead = keyToDate(first).getUTCDay();
    const daysIn = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
    const shift = (n: number) => {
        const d = keyToDate(first);
        d.setUTCMonth(d.getUTCMonth() + n);
        setMonth(d.toISOString().slice(0, 7));
    };
    return (
        <section className="ak-card ak-ch-cal" aria-label="Calendar">
            <header className="ak-ch-cal__head">
                <button type="button" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={16} /></button>
                <strong>{fmtKey(first, { month: 'long', year: 'numeric' })}</strong>
                <button type="button" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={16} /></button>
            </header>
            <div className="ak-ch-cal__grid">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="ak-ch-cal__dow">{d}</span>)}
                {Array.from({ length: lead }).map((_, i) => <span key={`b${i}`} />)}
                {Array.from({ length: daysIn }).map((_, i) => {
                    const key = `${month}-${String(i + 1).padStart(2, '0')}`;
                    const mk = marks.get(key);
                    const has = !!mk && (mk.posted > 0 || mk.next > 0);
                    const title = mk ? [mk.posted && `${mk.posted} posted`, mk.next && `${mk.next} scheduled`].filter(Boolean).join(', ') : undefined;
                    return (
                        <button key={key} type="button" disabled={!has} onClick={() => onPick(key)} title={title}
                            className={`ak-ch-cal__day${key === todayKey ? ' is-today' : ''}${has ? ' has' : ''}`}>
                            {i + 1}
                            {has && (
                                <span className="ak-ch-cal__dots" aria-hidden="true">
                                    {mk!.posted > 0 && <i className="is-posted" />}
                                    {mk!.next > 0 && <i className="is-next" />}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
            <footer className="ak-ch-cal__key"><span><i className="is-posted" /> Posted</span><span><i className="is-next" /> Scheduled</span></footer>
        </section>
    );
}

function NextUp({ rows, onOpen, onAll }: { rows: ContentRow[]; onOpen: (r: ContentRow) => void; onAll: () => void }) {
    return (
        <section className="ak-card ak-ch-next" aria-label="Next up">
            <header className="ak-ch-next__head"><strong>Next up</strong><button type="button" onClick={onAll}>See all</button></header>
            {rows.length === 0 ? <p className="ak-caption">Nothing scheduled.</p> : rows.map((r) => (
                <button key={r.id} type="button" className="ak-ch-next__row" onClick={() => onOpen(r)}>
                    <span className="ak-ch-next__thumb">
                        {r.cover ? <Image src={r.cover} alt="" fill sizes="44px" unoptimized={!isOptimizable(r.cover)} /> : <KindIcon kind={r.kind} size={14} />}
                    </span>
                    <span className="ak-ch-next__txt">
                        <span className="ak-ch-next__title">{r.title}</span>
                        <span className="ak-ch-next__when">{r.dayLabel} · {r.slotLabel}</span>
                    </span>
                </button>
            ))}
        </section>
    );
}

/**
 * New carousel: pick photos (upload or a Media folder), give it a title, and it
 * opens in the editor as a draft. AI Insights' "Make a carousel" lands here with
 * the story prefilled as the title.
 */
function NewCarouselSheet({ topic, onClose }: { topic: string; onClose: () => void }) {
    const router = useRouter();
    const [title, setTitle] = useState(topic);
    const [urls, setUrls] = useState<string[]>([]);
    const [busy, setBusy] = useState<'upload' | 'create' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [picking, setPicking] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    async function upload(files: File[]) {
        const imgs = files.filter((f) => f.type.startsWith('image/'));
        if (!imgs.length) { setError('Only image files work here.'); return; }
        setBusy('upload'); setError(null);
        try {
            const got: string[] = [];
            for (const file of imgs) {
                const fd = new FormData();
                fd.append('file', file);
                const res = await fetch('/api/admin/upload-image', { method: 'POST', credentials: 'same-origin', body: fd });
                const json = await res.json().catch(() => ({}));
                if (!res.ok || json.success === false || !json.url) throw new Error(json.error || `Upload failed (HTTP ${res.status})`);
                got.push(json.url);
            }
            setUrls((u) => [...u, ...got]);
        } catch (e: any) {
            setError(e?.message || 'Upload failed');
        } finally {
            setBusy(null);
        }
    }

    async function create() {
        if (!urls.length) return;
        setBusy('create'); setError(null);
        try {
            const res = await fetch('/api/admin/studio/new-image-post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ urls, title: title.trim() || undefined }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false || !json.id) throw new Error(json.error || `Could not create the draft (HTTP ${res.status})`);
            router.push(`/admin/post/${json.id}`);
        } catch (e: any) {
            setError(e?.message || 'Could not create the draft');
            setBusy(null);
        }
    }

    return (
        <>
        <div className="ak-modal__scrim" onClick={() => !busy && onClose()}>
            <div className="ak-modal ak-ch-newc" onClick={(e) => e.stopPropagation()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const fs = Array.from(e.dataTransfer.files || []); if (fs.length) upload(fs); }}>
                <div className="ak-modal__head">
                    <span className="ak-title">New carousel</span>
                    <button type="button" className="ak-btn ak-btn--ghost ak-btn--sm" onClick={onClose} disabled={!!busy}>Close</button>
                </div>
                <div className="ak-modal__body flex flex-col gap-4">
                    <div className="ak-field">
                        <label className="ak-field__label" htmlFor="ch-newc-title">What&apos;s it about?</label>
                        <input id="ch-newc-title" className="ak-field__input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Re:ZERO Season 4 announced" autoFocus={!topic} />
                    </div>
                    <div className="ak-ch-newc__pick">
                        <button type="button" className="ak-btn ak-btn--secondary" onClick={() => fileRef.current?.click()} disabled={!!busy}>
                            <Upload size={15} /> {busy === 'upload' ? 'Uploading…' : 'Upload photos'}
                        </button>
                        <button type="button" className="ak-btn ak-btn--secondary" onClick={() => setPicking(true)} disabled={!!busy}>
                            <Folder size={15} /> Pick from Media
                        </button>
                        <input ref={fileRef} type="file" accept="image/*" multiple hidden
                            onChange={(e) => { const fs = Array.from(e.target.files || []); if (fs.length) upload(fs); e.target.value = ''; }} />
                    </div>
                    {urls.length > 0 ? (
                        <div className="ak-ch-newc__slides">
                            {urls.map((u, i) => (
                                <span key={u + i} className="ak-ch-newc__slide">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={u} alt={`Slide ${i + 1}`} />
                                    <em>{i + 1}</em>
                                    <button type="button" onClick={() => setUrls((x) => x.filter((_, j) => j !== i))} aria-label={`Remove slide ${i + 1}`}><X size={12} /></button>
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p className="ak-caption">Pick the pictures in slide order. You can also drop them here.</p>
                    )}
                    {error && <div className="ak-auth__err">{error}</div>}
                </div>
                <div className="ak-modal__foot">
                    <button type="button" className="ak-btn ak-btn--primary" onClick={create} disabled={!urls.length || !!busy}>
                        {busy === 'create' ? 'Opening the editor…' : urls.length > 1 ? `Make carousel (${urls.length} slides)` : 'Make post'}
                    </button>
                </div>
            </div>
        </div>
            {/* Outside the scrim: React events bubble through the tree, so a click in the picker would close the sheet. */}
            {picking && (
                <MediaPickerModal
                    title="Pick slides"
                    confirmLabel={(n) => `Add ${n} ${n === 1 ? 'slide' : 'slides'}`}
                    onClose={() => setPicking(false)}
                    onConfirm={(picked) => { setUrls((u) => [...u, ...picked]); setPicking(false); }}
                />
            )}
        </>
    );
}
