'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Play, Clapperboard, Pencil, Library } from 'lucide-react';
import ImportFromUrlButton from '@/components/admin/dashboard/ImportFromUrlButton';

export interface VideoRow {
    id: string;
    title: string;
    status: string | null;
    image: string | null;
    timestamp?: string | null;
    editedAt?: string | null;
    edited: boolean;
}

const STATUS_CLASS: Record<string, string> = {
    pending: 'ak-badge--pending', draft: 'ak-badge--draft', approved: 'ak-badge--scheduled', published: 'ak-badge--published', declined: 'ak-badge--error',
};
const STATUS_LABEL: Record<string, string> = {
    pending: 'Pending', draft: 'Draft', approved: 'Scheduled', published: 'Published', declined: 'Declined',
};

function timeAgo(iso?: string | null): string {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 3_600_000) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
}

/** Studio > Videos workbench — drafts + recently-edited video work as cards. */
export default function VideoHub({ rows }: { rows: VideoRow[]; kind?: 'videos' | 'images' }) {
    const router = useRouter();

    return (
        <div className="max-w-6xl mx-auto">
            <div className="ak-studio-head">
                <p className="ak-caption">
                    {rows.length === 0 ? 'Nothing in progress' : `${rows.length} in progress · drafts + recently edited`}
                </p>
                <div className="flex items-center gap-2">
                    <ImportFromUrlButton />
                    <Link href="/admin/studio/library" className="ak-btn ak-btn--secondary ak-btn--sm">
                        <Library size={14} /> Library
                    </Link>
                </div>
            </div>

            {rows.length === 0 ? (
                <div className="ak-empty">
                    <span className="ak-empty__glyph" aria-hidden="true"><Clapperboard size={34} /></span>
                    <p className="ak-body-sm">No video work in progress. Open a piece from the <strong>Library</strong>, or find a video on a Pending post and it lands here as a draft.</p>
                    <Link href="/admin/studio/library" className="ak-btn ak-btn--primary ak-btn--sm" style={{ marginTop: 14 }}>
                        <Library size={14} /> Browse Library
                    </Link>
                </div>
            ) : (
                <div className="ak-vhub-grid">
                    {rows.map((v) => (
                        <button key={v.id} className="ak-vhub-card" onClick={() => router.push(`/admin/post/${v.id}/studio`)}>
                            <div className="ak-vhub-thumb">
                                {v.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={v.image} alt="" />
                                ) : (
                                    <span className="ak-vhub-thumb__fallback"><Clapperboard size={26} /></span>
                                )}
                                <span className="ak-vhub-play"><Play size={16} fill="currentColor" /></span>
                                {v.edited && <span className="ak-vhub-edited"><Pencil size={10} /> Edited</span>}
                            </div>
                            <div className="ak-vhub-meta">
                                <div className="ak-vhub-title">{v.title}</div>
                                <div className="ak-vhub-row">
                                    {v.status && <span className={`ak-badge ${STATUS_CLASS[v.status] || 'ak-badge--draft'}`}>{STATUS_LABEL[v.status] || v.status}</span>}
                                    <span className="ak-caption">{v.editedAt ? `edited ${timeAgo(v.editedAt)}` : timeAgo(v.timestamp)}</span>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
