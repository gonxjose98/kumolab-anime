'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminPageHeader from './AdminSubLayout';

type LogType = 'action' | 'scraper' | 'error' | 'agent' | 'scheduler';

interface LogEntry {
    id: string;
    created_at: string;
    [key: string]: any;
}

const LOG_FILTERS: { key: LogType; label: string; color: string; description: string }[] = [
    { key: 'action', label: 'Actions', color: '#00ff88', description: 'Approve, decline, publish events' },
    { key: 'scraper', label: 'Scraper', color: '#00d4ff', description: 'Every accept/reject decision' },
    { key: 'error', label: 'Errors', color: '#ff4444', description: 'All caught exceptions' },
    { key: 'agent', label: 'Agent', color: '#7b61ff', description: 'Agent cycle completions' },
    { key: 'scheduler', label: 'Scheduler', color: '#ffaa00', description: 'Cron job run history' },
];

export default function LogsPageClient() {
    const [activeFilter, setActiveFilter] = useState<LogType>('action');
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [limit, setLimit] = useState(50);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/logs?type=${activeFilter}&limit=${limit}`);
            if (res.ok) {
                const data = await res.json();
                // Handle both { success, logs } and direct array responses
                setLogs(Array.isArray(data) ? data : (data.logs || []));
            }
        } catch (e) {
            console.error('Failed to fetch logs:', e);
        } finally {
            setLoading(false);
        }
    }, [activeFilter, limit]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    const formatTime = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
        });
    };

    const renderLogEntry = (log: LogEntry) => {
        const filterConfig = LOG_FILTERS.find(f => f.key === activeFilter);
        const color = filterConfig?.color || '#fff';

        switch (activeFilter) {
            case 'action':
                return (
                    <div className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: color }} />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${color}15`, color, fontFamily: 'var(--font-display)' }}>
                                    {log.action}
                                </span>
                                <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                    {log.entity_title || log.entityTitle || '—'}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>by {log.actor || 'system'}</span>
                                {log.reason && <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>{log.reason}</span>}
                            </div>
                        </div>
                        <span className="text-[9px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{formatTime(log.created_at)}</span>
                    </div>
                );
            case 'scraper':
                return (
                    <div className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{
                            background: log.decision?.includes('accepted') ? '#00ff88' : log.decision?.includes('duplicate') ? '#ffaa00' : '#ff4444'
                        }} />
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                {log.candidate_title || log.candidateTitle || '—'}
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{
                                    background: log.decision?.includes('accepted') ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)',
                                    color: log.decision?.includes('accepted') ? '#00ff88' : '#ff4444',
                                    fontFamily: 'var(--font-display)',
                                }}>
                                    {log.decision}
                                </span>
                                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{log.source_name || log.sourceName}</span>
                                {log.score != null && <span className="text-[9px] font-mono" style={{ color: '#00d4ff' }}>score:{log.score}</span>}
                            </div>
                            {log.reason && <p className="text-[9px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{log.reason}</p>}
                        </div>
                        <span className="text-[9px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{formatTime(log.created_at)}</span>
                    </div>
                );
            case 'error':
                return (
                    <div className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#ff4444' }} />
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-medium" style={{ color: '#ff4444' }}>
                                {log.error_message || log.errorMessage || 'Unknown error'}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,68,68,0.1)', color: '#ff6666' }}>
                                    {log.source || 'unknown'}
                                </span>
                                {log.context && typeof log.context === 'object' && (
                                    <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                                        {JSON.stringify(log.context).substring(0, 80)}
                                    </span>
                                )}
                            </div>
                        </div>
                        <span className="text-[9px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{formatTime(log.created_at)}</span>
                    </div>
                );
            case 'agent':
                return (
                    <div className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#7b61ff' }} />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold" style={{ color: '#7b61ff' }}>{log.agent_name || log.agentName}</span>
                                <span className="text-[11px]" style={{ color: 'var(--text-primary)' }}>{log.action}</span>
                            </div>
                            {log.details && <p className="text-[9px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{log.details}</p>}
                        </div>
                        <span className="text-[9px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{formatTime(log.created_at)}</span>
                    </div>
                );
            case 'scheduler':
                return (
                    <div className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{
                            background: log.status === 'success' ? '#00ff88' : '#ff4444'
                        }} />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase" style={{ color: '#ffaa00', fontFamily: 'var(--font-display)' }}>
                                    {log.worker_name || log.workerName || 'scheduler'}
                                </span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded" style={{
                                    background: log.status === 'success' ? 'rgba(0,255,136,0.1)' : 'rgba(255,68,68,0.1)',
                                    color: log.status === 'success' ? '#00ff88' : '#ff4444',
                                }}>
                                    {log.status}
                                </span>
                            </div>
                            {log.message && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{log.message}</p>}
                        </div>
                        <span className="text-[9px] flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{formatTime(log.created_at || log.timestamp)}</span>
                    </div>
                );
            default:
                return <pre className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{JSON.stringify(log, null, 2)}</pre>;
        }
    };

    return (
        <div className="max-w-7xl mx-auto">
            <AdminPageHeader
                title="Logs"
                subtitle="View all system logs — filter by type"
                accentColor="#ff6b35"
                icon="M4 6h16M4 10h16M4 14h16M4 18h16"
            />

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 p-1 rounded-xl w-fit mb-6" style={{
                background: 'rgba(12,12,24,0.5)',
                border: '1px solid rgba(255,255,255,0.05)',
                backdropFilter: 'blur(20px)',
            }}>
                {LOG_FILTERS.map((filter) => (
                    <button
                        key={filter.key}
                        onClick={() => setActiveFilter(filter.key)}
                        className="relative flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300"
                        style={{
                            color: activeFilter === filter.key ? '#fff' : 'var(--text-muted)',
                            background: activeFilter === filter.key ? `${filter.color}15` : 'transparent',
                            border: activeFilter === filter.key ? `1px solid ${filter.color}30` : '1px solid transparent',
                            fontFamily: 'var(--font-display)',
                        }}
                    >
                        <span className="text-[10px] font-bold uppercase tracking-wider">{filter.label}</span>
                        {activeFilter === filter.key && (
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full" style={{ background: filter.color, opacity: 0.5 }} />
                        )}
                    </button>
                ))}
            </div>

            {/* Description */}
            <p className="text-[10px] mb-4" style={{ color: 'var(--text-muted)' }}>
                {LOG_FILTERS.find(f => f.key === activeFilter)?.description}
            </p>

            {/* Limit selector */}
            <div className="flex items-center gap-2 mb-4">
                <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>Show</span>
                {[25, 50, 100, 200].map(n => (
                    <button
                        key={n}
                        onClick={() => setLimit(n)}
                        className="px-2 py-1 rounded text-[10px] font-mono transition-all"
                        style={{
                            background: limit === n ? 'rgba(255,107,53,0.15)' : 'rgba(255,255,255,0.03)',
                            border: limit === n ? '1px solid rgba(255,107,53,0.3)' : '1px solid rgba(255,255,255,0.05)',
                            color: limit === n ? '#ff6b35' : 'var(--text-muted)',
                        }}
                    >
                        {n}
                    </button>
                ))}
                <button
                    onClick={fetchLogs}
                    className="ml-2 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all hover:scale-105"
                    style={{ background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.25)', color: '#ff6b35', fontFamily: 'var(--font-display)' }}
                >
                    Refresh
                </button>
            </div>

            {/* Log entries */}
            <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(12,12,24,0.5)', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}>
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#ff6b35', borderTopColor: 'transparent' }} />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-16">
                        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No {activeFilter} logs found</p>
                    </div>
                ) : (
                    <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.03)' }}>
                        {logs.map((log, i) => (
                            <div
                                key={log.id || i}
                                className="px-4 py-3 transition-colors hover:bg-white/[0.02]"
                                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                            >
                                {renderLogEntry(log)}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
