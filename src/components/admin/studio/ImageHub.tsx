'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Image as ImageIcon, Pencil } from 'lucide-react';

export interface ImageRow {
    id: string;
    title: string;
    status: string | null;
    image: string | null;
    timestamp?: string | null;
    edited: boolean;
}

type Filter = 'all' | 'pending' | 'draft' | 'approved' | 'published';
const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'draft', label: 'Draft' },
    { key: 'approved', label: 'Scheduled' },
    { key: 'published', label: 'Published' },
];
const STATUS_CLASS: Record<string, string> = {
    pending: 'ak-badge--pending', draft: 'ak-badge--draft', approved: 'ak-badge--scheduled', published: 'ak-badge--published', declined: 'ak-badge--error',
};

function timeAgo(iso?: string | null): string {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 3_600_000) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function ImageHub({ rows }: { rows: ImageRow[] }) {
    const router = useRouter();
    const [filter, setFilter] = useState<Filter>('all');

    const counts = useMemo(() => {
        const c: Record<string, number> = { all: rows.length };
        for (const r of rows) if (r.status) c[r.status] = (c[r.status] || 0) + 1;
        return c;
    }, [rows]);

    const visible = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
                <p className="ak-caption">{rows.length} image post{rows.length === 1 ? '' : 's'} · open any to edit its card, overlays &amp; caption</p>
            </div>

            <div className="ak-pills" style={{ marginBottom: '18px', flexWrap: 'wrap' }}>
                {FILTERS.map((f) => (
                    <button key={f.key} onClick={() => setFilter(f.key)} className={`ak-pill ${filter === f.key ? 'ak-pill--active' : ''}`}>
                        <span>{f.label}</span>
                        <span className="ak-pill__count">{counts[f.key] || 0}</span>
                    </button>
                ))}
            </div>

            {visible.length === 0 ? (
                <div className="ak-empty">
                    <span className="ak-empty__glyph" aria-hidden="true"><ImageIcon size={34} /></span>
                    <p className="ak-body-sm">No {filter === 'all' ? '' : filter + ' '}image posts yet.</p>
                </div>
            ) : (
                <div className="ak-vhub-grid">
                    {visible.map((v) => (
                        <button key={v.id} className="ak-vhub-card" onClick={() => router.push(`/admin/post/${v.id}`)}>
                            <div className="ak-vhub-thumb">
                                {v.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={v.image} alt="" />
                                ) : (
                                    <span className="ak-vhub-thumb__fallback"><ImageIcon size={26} /></span>
                                )}
                                <span className="ak-vhub-play"><Pencil size={15} /></span>
                                {v.edited && <span className="ak-vhub-edited"><Pencil size={10} /> Edited</span>}
                            </div>
                            <div className="ak-vhub-meta">
                                <div className="ak-vhub-title">{v.title}</div>
                                <div className="ak-vhub-row">
                                    {v.status && <span className={`ak-badge ${STATUS_CLASS[v.status] || 'ak-badge--draft'}`}>{v.status}</span>}
                                    <span className="ak-caption">{timeAgo(v.timestamp)}</span>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
