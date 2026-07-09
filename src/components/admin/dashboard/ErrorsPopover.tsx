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
        return <div className="ak-badge ak-badge--success ak-badge--bare">All clear</div>;
    }

    return (
        <div ref={wrapRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="ak-badge ak-badge--error"
                style={{ cursor: 'pointer', height: '24px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}
                aria-haspopup="dialog"
                aria-expanded={open}
                title={`${count} error${count === 1 ? '' : 's'} in the last 24h`}
            >
                View log
                <span aria-hidden style={{ fontSize: '9px' }}>{open ? '▲' : '▼'}</span>
            </button>

            {open && (
                <div
                    className="absolute right-0 mt-2 z-50 rounded-xl overflow-hidden"
                    style={{
                        width: 'min(440px, calc(100vw - 32px))',
                        maxHeight: 'min(70vh, 600px)',
                        background: 'var(--surface)',
                        border: '1px solid #f0c4be',
                        boxShadow: 'var(--shadow-2)',
                    }}
                    role="dialog"
                    aria-label="Recent errors"
                >
                    <div className="px-4 py-3 flex items-center justify-between"
                         style={{ borderBottom: '1px solid var(--line)' }}>
                        <span className="ak-overline">Recent Errors (24h)</span>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="ak-btn ak-btn--ghost ak-btn--sm"
                            aria-label="Close"
                        >
                            ✕
                        </button>
                    </div>
                    <div className="overflow-y-auto" style={{ maxHeight: 'calc(min(70vh, 600px) - 50px)' }}>
                        {errors.length === 0 ? (
                            <p className="px-4 py-6 ak-caption text-center">
                                No error rows available.
                            </p>
                        ) : (
                            <ul>
                                {errors.map(err => (
                                    <li key={err.id} style={{ borderTop: '1px solid var(--line)' }}>
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
                className="w-full flex items-center gap-2 py-2.5 px-4 text-left"
                style={{ background: 'transparent' }}
            >
                <span
                    className="text-[10px] shrink-0 transition-transform"
                    style={{
                        color: 'var(--ink-3)',
                        transform: expanded ? 'rotate(90deg)' : 'rotate(0)',
                    }}
                    aria-hidden
                >
                    ▶
                </span>
                <span className="ak-badge ak-badge--error shrink-0" style={{ height: '20px', fontSize: '11px' }}>
                    {err.source || 'unknown'}
                </span>
                <span className="ak-caption shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {timeAgo(err.created_at)}
                </span>
                <span className="ak-body-sm truncate flex-1 min-w-0" style={{ color: 'var(--ink)' }}>
                    {preview}
                </span>
            </button>

            {expanded && (
                <div className="pl-10 pr-4 pb-3 pt-1 space-y-2">
                    <div>
                        <div className="ak-overline mb-1">Message</div>
                        <p className="ak-body-sm break-words" style={{ color: 'var(--ink)' }}>
                            {message}
                        </p>
                    </div>
                    <div className="ak-caption">{absTime} ET</div>
                    {contextEntries.length > 0 && (
                        <div>
                            <div className="ak-overline mb-1.5">Context</div>
                            <dl className="space-y-1">
                                {contextEntries.map(([k, v]) => (
                                    <div key={k} className="flex gap-3 text-[11px]">
                                        <dt className="font-mono shrink-0" style={{ color: 'var(--ink-3)', minWidth: '110px' }}>
                                            {k}
                                        </dt>
                                        <dd className="font-mono break-all" style={{ color: 'var(--ink)' }} title={v.length > 200 ? v : undefined}>
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
