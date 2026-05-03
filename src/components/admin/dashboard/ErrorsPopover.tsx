'use client';

import { useEffect, useRef, useState } from 'react';

// Top-right errors button that opens a floating popover with the same
// collapsible error list that previously lived on the dashboard body.
// Each error in the popover is still its own collapsed row — click a row
// to expand the full message + a tidy field/value context list.

export type DashboardError = {
    id: string;
    source: string | null;
    error_message: string | null;
    context: any;
    created_at: string;
};

function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return 'just now';
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
}

export default function ErrorsPopover({ count, errors }: { count: number; errors: DashboardError[] }) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    // Click-outside + ESC close so the popover feels like a normal menu.
    useEffect(() => {
        if (!open) return;
        function onClick(e: MouseEvent) {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false);
        }
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    if (count === 0) {
        return (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                 style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: '#00ff88', boxShadow: '0 0 8px #00ff88' }}
                />
                <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                    All systems operational
                </span>
            </div>
        );
    }

    return (
        <div ref={wrapRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all hover:bg-white/[0.06]"
                style={{
                    background: open ? 'rgba(255,68,68,0.14)' : 'rgba(255,68,68,0.08)',
                    border: '1px solid rgba(255,68,68,0.30)',
                }}
                aria-haspopup="dialog"
                aria-expanded={open}
            >
                <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ background: '#ff4444', boxShadow: '0 0 8px #ff4444' }}
                />
                <span className="text-[10px] font-mono" style={{ color: '#ff9999' }}>
                    {count} error{count === 1 ? '' : 's'} in last 24h
                </span>
                <span className="text-[10px]" style={{ color: '#ff9999' }} aria-hidden>
                    {open ? '▲' : '▼'}
                </span>
            </button>

            {open && (
                <div
                    className="absolute right-0 mt-2 z-50 rounded-xl overflow-hidden"
                    style={{
                        width: 'min(440px, calc(100vw - 32px))',
                        maxHeight: 'min(70vh, 600px)',
                        background: 'rgba(12, 12, 24, 0.96)',
                        border: '1px solid rgba(255,68,68,0.25)',
                        backdropFilter: 'blur(20px)',
                        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
                    }}
                    role="dialog"
                    aria-label="Recent errors"
                >
                    <div className="px-4 py-3 flex items-center justify-between"
                         style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <span
                            className="text-[10px] font-bold uppercase tracking-[0.25em]"
                            style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}
                        >
                            Recent Errors (24h)
                        </span>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="text-[12px] hover:text-white"
                            style={{ color: 'var(--text-tertiary)' }}
                            aria-label="Close"
                        >
                            ✕
                        </button>
                    </div>
                    <div className="overflow-y-auto" style={{ maxHeight: 'calc(min(70vh, 600px) - 50px)' }}>
                        {errors.length === 0 ? (
                            <p className="px-4 py-6 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                                No error rows available.
                            </p>
                        ) : (
                            <ul>
                                {errors.map(err => (
                                    <li key={err.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                        <ErrorRow err={err} />
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function ErrorRow({ err }: { err: DashboardError }) {
    const [expanded, setExpanded] = useState(false);
    const message = err.error_message || '(no message)';
    const preview = message.length > 80 ? message.slice(0, 80) + '…' : message;
    const contextEntries: [string, string][] = err.context && typeof err.context === 'object'
        ? Object.entries(err.context).map(([k, v]) => {
            const s = typeof v === 'string'
                ? v
                : (() => { try { return JSON.stringify(v); } catch { return String(v); } })();
            return [k, s];
        })
        : [];
    const absTime = new Date(err.created_at).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });

    return (
        <div>
            <button
                type="button"
                onClick={() => setExpanded(e => !e)}
                className="w-full flex items-center gap-2 py-2.5 px-4 hover:bg-white/[0.03] text-left"
            >
                <span
                    className="text-[10px] shrink-0 transition-transform"
                    style={{
                        color: 'var(--text-muted)',
                        transform: expanded ? 'rotate(90deg)' : 'rotate(0)',
                    }}
                    aria-hidden
                >
                    ▶
                </span>
                <span
                    className="text-[10px] font-mono px-2 py-0.5 rounded shrink-0"
                    style={{ background: 'rgba(255,68,68,0.12)', border: '1px solid rgba(255,68,68,0.28)', color: '#ff9999' }}
                >
                    {err.source || 'unknown'}
                </span>
                <span className="text-[10px] font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {timeAgo(err.created_at)}
                </span>
                <span className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
                    {preview}
                </span>
            </button>

            {expanded && (
                <div className="pl-10 pr-4 pb-3 pt-1 space-y-2">
                    <div>
                        <div className="text-[9px] font-bold uppercase tracking-[0.2em] mb-1" style={{ color: 'var(--text-muted)' }}>
                            Message
                        </div>
                        <p className="text-sm break-words" style={{ color: 'var(--text-primary)' }}>
                            {message}
                        </p>
                    </div>
                    <div className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                        {absTime} ET
                    </div>
                    {contextEntries.length > 0 && (
                        <div>
                            <div className="text-[9px] font-bold uppercase tracking-[0.2em] mb-1.5" style={{ color: 'var(--text-muted)' }}>
                                Context
                            </div>
                            <dl className="space-y-1">
                                {contextEntries.map(([k, v]) => (
                                    <div key={k} className="flex gap-3 text-[11px]">
                                        <dt
                                            className="font-mono shrink-0"
                                            style={{ color: 'var(--text-tertiary)', minWidth: '110px' }}
                                        >
                                            {k}
                                        </dt>
                                        <dd
                                            className="font-mono break-all"
                                            style={{ color: 'var(--text-primary)' }}
                                            title={v.length > 200 ? v : undefined}
                                        >
                                            {v.length > 200 ? v.slice(0, 200) + '…' : v}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
