'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Play, Image as ImageIcon, Search, ArrowLeft, Copy } from 'lucide-react';

export interface LibraryItem {
    id: string;
    title: string;
    status: string | null;
    image: string | null;
    kind: 'video' | 'image';
    timestamp?: string | null;
}

type Filter = 'all' | 'draft' | 'pending' | 'approved' | 'published';
const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Drafts' },
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Scheduled' },
    { key: 'published', label: 'Published' },
];
const STATUS_CLASS: Record<string, string> = {
    pending: 'ak-badge--pending', draft: 'ak-badge--draft', approved: 'ak-badge--scheduled', published: 'ak-badge--published', declined: 'ak-badge--error',
};
const STATUS_LABEL: Record<string, string> = {
    pending: 'Pending', draft: 'Draft', approved: 'Scheduled', published: 'Published', declined: 'Declined',
};

// Live content (scheduled/published) opens as a fresh draft copy; drafts and
// pending open in place.
const opensAsCopy = (status: string | null) => status === 'approved' || status === 'published';

function timeAgo(iso?: string | null): string {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 3_600_000) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
}

const editorUrl = (id: string, kind: 'video' | 'image') => (kind === 'video' ? `/admin/post/${id}/studio` : `/admin/post/${id}`);

export default function LibraryBrowser({ items }: { items: LibraryItem[] }) {
    const router = useRouter();
    const [filter, setFilter] = useState<Filter>('all');
    const [q, setQ] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const counts = useMemo(() => {
        const c: Record<string, number> = { all: items.length };
        for (const it of items) if (it.status) c[it.status] = (c[it.status] || 0) + 1;
        return c;
    }, [items]);

    const visible = useMemo(() => {
        const needle = q.trim().toLowerCase();
        return items.filter((it) => {
            if (filter !== 'all' && it.status !== filter) return false;
            if (needle && !it.title.toLowerCase().includes(needle)) return false;
            return true;
        });
    }, [items, filter, q]);

    async function open(it: LibraryItem) {
        setError(null);
        if (!opensAsCopy(it.status)) {
            router.push(editorUrl(it.id, it.kind));
            return;
        }
        // Scheduled/published → clone to a draft, then open the copy.
        setBusyId(it.id);
        try {
            const res = await fetch('/api/admin/studio/duplicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ postId: it.id }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) throw new Error(json.error || `Copy failed (HTTP ${res.status})`);
            router.push(editorUrl(json.id, json.kind || it.kind));
        } catch (e: any) {
            setError(e?.message || 'Could not make a draft copy');
            setBusyId(null);
        }
    }

    return (
        <div className="max-w-6xl mx-auto">
            <div className="ak-studio-head">
                <Link href="/admin/studio/videos" className="ak-btn ak-btn--ghost ak-btn--sm">
                    <ArrowLeft size={14} /> Back to Studio
                </Link>
                <div className="ak-lib-search">
                    <Search size={15} />
                    <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search the library…"
                        className="ak-field__input"
                        style={{ height: 34 }}
                    />
                </div>
            </div>

            <div className="ak-pills" style={{ marginBottom: 18, flexWrap: 'wrap' }}>
                {FILTERS.map((f) => (
                    <button key={f.key} onClick={() => setFilter(f.key)} className={`ak-pill ${filter === f.key ? 'ak-pill--active' : ''}`}>
                        <span>{f.label}</span>
                        <span className="ak-pill__count">{counts[f.key] || 0}</span>
                    </button>
                ))}
            </div>

            {error && <div className="ak-alert ak-alert--error" style={{ marginBottom: 14 }}>{error}</div>}

            {visible.length === 0 ? (
                <div className="ak-empty">
                    <span className="ak-empty__glyph" aria-hidden="true">雲</span>
                    <p className="ak-body-sm">Nothing here{q ? ' matches your search' : ''}.</p>
                </div>
            ) : (
                <div className="ak-vhub-grid">
                    {visible.map((it) => {
                        const copy = opensAsCopy(it.status);
                        const busy = busyId === it.id;
                        return (
                            <button
                                key={it.id}
                                className="ak-vhub-card"
                                onClick={() => open(it)}
                                disabled={!!busyId}
                                title={copy ? 'Opens as a draft copy (original stays live)' : 'Open in the editor'}
                            >
                                <div className="ak-vhub-thumb">
                                    {it.image ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={it.image} alt="" />
                                    ) : (
                                        <span className="ak-vhub-thumb__fallback">{it.kind === 'video' ? <Play size={26} /> : <ImageIcon size={26} />}</span>
                                    )}
                                    <span className="ak-vhub-play">{it.kind === 'video' ? <Play size={16} fill="currentColor" /> : <ImageIcon size={15} />}</span>
                                    {copy && <span className="ak-vhub-edited"><Copy size={10} /> Copy</span>}
                                    {busy && <span className="ak-lib-copying">Copying…</span>}
                                </div>
                                <div className="ak-vhub-meta">
                                    <div className="ak-vhub-title">{it.title}</div>
                                    <div className="ak-vhub-row">
                                        {it.status && <span className={`ak-badge ${STATUS_CLASS[it.status] || 'ak-badge--draft'}`}>{STATUS_LABEL[it.status] || it.status}</span>}
                                        <span className="ak-caption">{timeAgo(it.timestamp)}</span>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
