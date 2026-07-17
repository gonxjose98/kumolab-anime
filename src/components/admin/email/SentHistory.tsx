'use client';

import { useState } from 'react';
import { History, ChevronDown } from 'lucide-react';

/**
 * Compact sent-history dropdown for the Email tab: a small button that opens
 * a popover listing the most recent mass emails (admin broadcasts + weekly
 * Forecast runs) with subject, date, and recipient count. Deliberately tiny:
 * it lives in the broadcast card's header and takes no layout space until
 * opened.
 */

export type SentEmail = {
    id: string;
    kind: string;
    subject: string;
    recipientCount: number;
    sentAt: string;
};

const KIND_LABELS: Record<string, string> = {
    broadcast: 'Broadcast',
    forecast: 'The Forecast',
    system: 'System',
};

function formatSentAt(iso: string): string {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
        return '';
    }
}

export default function SentHistory({ sends }: { sends: SentEmail[] }) {
    const [open, setOpen] = useState(false);

    return (
        <div style={{ position: 'relative' }}>
            <button
                type="button"
                className="ak-btn ak-btn--ghost ak-btn--sm"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                aria-haspopup="true"
            >
                <History size={14} /> Sent history
                <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }} />
            </button>

            {open && (
                <>
                    {/* click-away scrim */}
                    <div style={{ position: 'fixed', inset: 0, zIndex: 55 }} onClick={() => setOpen(false)} aria-hidden="true" />
                    <div
                        role="menu"
                        style={{
                            position: 'absolute',
                            right: 0,
                            top: 'calc(100% + 6px)',
                            zIndex: 60,
                            width: 'min(340px, calc(100vw - 48px))',
                            maxHeight: 320,
                            overflowY: 'auto',
                            background: 'var(--surface)',
                            border: '1px solid var(--line)',
                            borderRadius: 12,
                            boxShadow: 'var(--shadow-2)',
                        }}
                    >
                        {sends.length === 0 ? (
                            <div className="ak-caption" style={{ padding: '14px 16px' }}>
                                No mass emails sent yet. Broadcasts and the weekly Forecast will show up here.
                            </div>
                        ) : (
                            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                                {sends.map((s, i) => (
                                    <li
                                        key={s.id}
                                        style={{ padding: '10px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}
                                    >
                                        <div
                                            className="ak-body-sm"
                                            style={{
                                                fontWeight: 500,
                                                color: 'var(--ink)',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                            title={s.subject}
                                        >
                                            {s.subject}
                                        </div>
                                        <div className="ak-caption" style={{ marginTop: 2 }}>
                                            {formatSentAt(s.sentAt)} · {s.recipientCount.toLocaleString()} recipient{s.recipientCount === 1 ? '' : 's'} · {KIND_LABELS[s.kind] ?? s.kind}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
