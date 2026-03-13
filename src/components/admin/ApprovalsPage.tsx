'use client';

import { useState, useEffect } from 'react';
import AdminPageHeader from './AdminSubLayout';

interface ApprovalEntry {
    id: string;
    title: string;
    image: string | null;
    status: string;
    type: string;
    approved_at: string | null;
    approved_by: string | null;
    scheduled_post_time: string | null;
    source_tier: number | null;
    is_published: boolean;
    timestamp: string;
}

type FilterType = 'all' | 'auto' | 'manual';

export default function ApprovalsPageClient() {
    const [entries, setEntries] = useState<ApprovalEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterType>('all');

    useEffect(() => {
        async function fetchApprovals() {
            try {
                const res = await fetch('/api/admin/approvals-history');
                if (res.ok) setEntries(await res.json());
            } catch (e) {
                console.error('Failed to fetch approvals:', e);
            } finally {
                setLoading(false);
            }
        }
        fetchApprovals();
    }, []);

    const filtered = entries.filter(e => {
        if (filter === 'all') return true;
        if (filter === 'auto') return e.approved_by === 'system' || e.approved_by === 'auto' || e.approved_by === 'Scraper';
        return e.approved_by !== 'system' && e.approved_by !== 'auto' && e.approved_by !== 'Scraper';
    });

    const formatDate = (iso: string | null) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const getStatusStyle = (status: string, isPublished: boolean) => {
        if (isPublished || status === 'published') return { bg: 'rgba(0,255,136,0.1)', border: 'rgba(0,255,136,0.2)', color: '#00ff88', label: 'Published' };
        if (status === 'approved') return { bg: 'rgba(0,212,255,0.1)', border: 'rgba(0,212,255,0.2)', color: '#00d4ff', label: 'Approved' };
        if (status === 'declined') return { bg: 'rgba(255,68,68,0.1)', border: 'rgba(255,68,68,0.2)', color: '#ff4444', label: 'Declined' };
        return { bg: 'rgba(255,170,0,0.1)', border: 'rgba(255,170,0,0.2)', color: '#ffaa00', label: 'Pending' };
    };

    const FILTERS: { key: FilterType; label: string; color: string }[] = [
        { key: 'all', label: 'All', color: '#7b61ff' },
        { key: 'manual', label: 'Manual', color: '#00d4ff' },
        { key: 'auto', label: 'Auto', color: '#00ff88' },
    ];

    return (
        <div className="max-w-7xl mx-auto">
            <AdminPageHeader
                title="Approvals History"
                subtitle="Visual timeline of all blog post approvals"
                accentColor="#00ff88"
                icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />

            {/* Filters */}
            <div className="flex items-center gap-1 p-1 rounded-xl w-fit mb-6" style={{ background: 'rgba(12,12,24,0.5)', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}>
                {FILTERS.map((f) => (
                    <button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                        style={{
                            fontFamily: 'var(--font-display)',
                            color: filter === f.key ? f.color : 'var(--text-muted)',
                            background: filter === f.key ? `${f.color}12` : 'transparent',
                            border: filter === f.key ? `1px solid ${f.color}25` : '1px solid transparent',
                        }}
                    >
                        {f.label}
                    </button>
                ))}
                <span className="text-[9px] font-mono px-2" style={{ color: 'var(--text-muted)' }}>{filtered.length} entries</span>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#00ff88', borderTopColor: 'transparent' }} />
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.length === 0 ? (
                        <div className="text-center py-20 text-[11px]" style={{ color: 'var(--text-muted)' }}>No approval history found</div>
                    ) : filtered.map((entry) => {
                        const s = getStatusStyle(entry.status, entry.is_published);
                        const isAuto = entry.approved_by === 'system' || entry.approved_by === 'auto' || entry.approved_by === 'Scraper';

                        return (
                            <div
                                key={entry.id}
                                className="flex items-center gap-4 p-3 rounded-xl transition-all hover:scale-[1.005]"
                                style={{ background: 'rgba(12,12,24,0.4)', border: '1px solid rgba(255,255,255,0.04)', backdropFilter: 'blur(10px)' }}
                            >
                                {/* Timeline dot */}
                                <div className="flex flex-col items-center flex-shrink-0">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.color, boxShadow: `0 0 8px ${s.color}40` }} />
                                </div>

                                {/* Thumbnail */}
                                {entry.image && (
                                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={entry.image} alt="" className="w-full h-full object-cover" style={{ opacity: 1 }} />
                                    </div>
                                )}

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{entry.title}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color, fontFamily: 'var(--font-display)' }}>
                                            {s.label}
                                        </span>
                                        <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: isAuto ? 'rgba(0,255,136,0.08)' : 'rgba(0,212,255,0.08)', color: isAuto ? '#00ff88' : '#00d4ff', fontFamily: 'var(--font-display)' }}>
                                            {isAuto ? 'Auto' : 'Manual'}
                                        </span>
                                        {entry.source_tier && (
                                            <span className="text-[8px] font-mono" style={{ color: 'var(--text-muted)' }}>T{entry.source_tier}</span>
                                        )}
                                    </div>
                                </div>

                                {/* Meta */}
                                <div className="text-right flex-shrink-0">
                                    <p className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>
                                        {entry.approved_by && entry.approved_by !== 'system' && entry.approved_by !== 'auto' ? `by ${entry.approved_by}` : 'automated'}
                                    </p>
                                    <p className="text-[8px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                        {formatDate(entry.approved_at || entry.timestamp)}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
