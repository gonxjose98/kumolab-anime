'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, UserPlus, Upload, UserX } from 'lucide-react';
import type { SystemEmailTemplate } from '@/lib/email/templates';
import SystemEmails from './SystemEmails';
import SentHistory, { type SentEmail } from './SentHistory';

export type Subscriber = {
    id: string;
    email: string;
    name: string;
    status: string;
    source: string;
    createdAt: string;
};

/** Escape user text, then turn newlines into <br> for a simple v1 html body. */
function textToHtml(text: string): string {
    const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    return `<div style="font-size:15px;line-height:1.6;">${escaped.replace(/\n/g, '<br>')}</div>`;
}

function formatDate(iso: string): string {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
        return '';
    }
}

export default function EmailManager({
    subscribers,
    total,
    subscribed,
    resendConnected,
    systemTemplates,
    sends,
}: {
    subscribers: Subscriber[];
    total: number;
    subscribed: number;
    resendConnected: boolean;
    systemTemplates: SystemEmailTemplate[];
    sends: SentEmail[];
}) {
    return (
        <div className="flex flex-col gap-6" style={{ maxWidth: '760px' }}>
            <div className="ak-card">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <span className="ak-overline">Your list</span>
                        <div className="ak-title" style={{ display: 'block', marginTop: 4 }}>
                            {subscribed.toLocaleString()} subscribed
                            <span className="ak-caption" style={{ marginLeft: 8 }}>of {total.toLocaleString()} total</span>
                        </div>
                    </div>
                    <p className="ak-caption" style={{ margin: 0, maxWidth: '320px' }}>
                        This list is yours: it lives in KumoLab&apos;s own database, not a third-party service.
                    </p>
                </div>
            </div>

            <BroadcastCard subscribed={subscribed} resendConnected={resendConnected} sends={sends} />
            <SystemEmails templates={systemTemplates} />
            <AddSubscriberCard />
            <ImportCard />
            <SubscriberList subscribers={subscribers} total={total} />
        </div>
    );
}

function BroadcastCard({ subscribed, resendConnected, sends }: { subscribed: number; resendConnected: boolean; sends: SentEmail[] }) {
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const ready = subject.trim().length > 0 && message.trim().length > 0 && subscribed > 0;

    async function send() {
        setSending(true);
        setError(null);
        setResult(null);
        try {
            const res = await fetch('/api/admin/email/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ subject: subject.trim(), html: textToHtml(message.trim()), text: message.trim() }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) throw new Error(json.error || `Send failed (HTTP ${res.status})`);
            setResult(json.failed > 0 ? `Sent to ${json.sent}, ${json.failed} failed` : `Sent to ${json.sent} subscriber${json.sent === 1 ? '' : 's'}`);
            setSubject('');
            setMessage('');
        } catch (e: any) {
            setError(e?.message || 'Send failed');
        } finally {
            setSending(false);
            setConfirming(false);
        }
    }

    return (
        <div className="ak-card flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="ak-title">Send a broadcast</span>
                <div className="flex items-center gap-3 flex-wrap">
                    {!resendConnected && (
                        <span className="ak-caption" style={{ color: 'var(--gold-text)' }}>
                            Connect Resend (set RESEND_API_KEY) to send. You can still manage subscribers.
                        </span>
                    )}
                    <SentHistory sends={sends} />
                </div>
            </div>

            <div className="ak-field">
                <label className="ak-field__label">Subject</label>
                <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={sending}
                    placeholder="e.g. New drop: the Cumulus tee is live"
                    className="ak-field__input"
                />
            </div>

            <div className="ak-field">
                <label className="ak-field__label">Message</label>
                <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={sending}
                    rows={7}
                    placeholder="Write your email. Plain text is fine, line breaks are kept."
                    className="ak-field__input"
                    style={{ resize: 'vertical', minHeight: '120px' }}
                />
                <p className="ak-caption" style={{ marginTop: 6 }}>
                    An unsubscribe link is added to every email automatically.
                </p>
            </div>

            {result && <div className="ak-body-sm" style={{ color: '#1d7a4f' }}>{result}</div>}
            {error && <div className="ak-auth__err">{error}</div>}

            {!confirming ? (
                <div>
                    <button
                        className="ak-btn ak-btn--primary"
                        onClick={() => { setResult(null); setError(null); setConfirming(true); }}
                        disabled={!ready || sending}
                        title={subscribed === 0 ? 'No subscribers yet' : undefined}
                    >
                        <Send size={15} /> Send to {subscribed.toLocaleString()} subscriber{subscribed === 1 ? '' : 's'}
                    </button>
                </div>
            ) : (
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="ak-body-sm">This emails {subscribed.toLocaleString()} {subscribed === 1 ? 'person' : 'people'}, send?</span>
                    <button className="ak-btn ak-btn--primary ak-btn--sm" onClick={send} disabled={sending}>
                        {sending ? 'Sending…' : 'Yes, send'}
                    </button>
                    <button className="ak-btn ak-btn--secondary ak-btn--sm" onClick={() => setConfirming(false)} disabled={sending}>
                        Cancel
                    </button>
                </div>
            )}
        </div>
    );
}

function AddSubscriberCard() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!email.trim()) return;
        setSaving(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/email/subscribers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ email: email.trim(), name: name.trim() }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) throw new Error(json.error || `Could not add (HTTP ${res.status})`);
            setEmail('');
            setName('');
            router.refresh();
        } catch (e: any) {
            setError(e?.message || 'Could not add subscriber');
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={submit} className="ak-card flex flex-col gap-4">
            <span className="ak-title">Add a subscriber</span>
            <div className="flex gap-3 flex-wrap">
                <div className="ak-field" style={{ flex: '1 1 200px' }}>
                    <label className="ak-field__label">Email</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} placeholder="name@example.com" className="ak-field__input" />
                </div>
                <div className="ak-field" style={{ flex: '1 1 160px' }}>
                    <label className="ak-field__label">Name <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--ink-3)' }}>(optional)</span></label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} placeholder="e.g. Aiko" className="ak-field__input" />
                </div>
            </div>
            {error && <div className="ak-auth__err">{error}</div>}
            <div>
                <button type="submit" className="ak-btn ak-btn--primary" disabled={saving || !email.trim()}>
                    <UserPlus size={15} /> {saving ? 'Adding…' : 'Add subscriber'}
                </button>
            </div>
        </form>
    );
}

function ImportCard() {
    const router = useRouter();
    const [blob, setBlob] = useState('');
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!blob.trim()) return;
        setImporting(true);
        setError(null);
        setResult(null);
        try {
            const res = await fetch('/api/admin/email/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ emails: blob }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) throw new Error(json.error || `Import failed (HTTP ${res.status})`);
            setResult(`Added ${json.added}, skipped ${json.skipped} (duplicates or invalid)`);
            setBlob('');
            router.refresh();
        } catch (e: any) {
            setError(e?.message || 'Import failed');
        } finally {
            setImporting(false);
        }
    }

    return (
        <form onSubmit={submit} className="ak-card flex flex-col gap-4">
            <span className="ak-title">Import emails</span>
            <div className="ak-field">
                <label className="ak-field__label">Paste addresses <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, color: 'var(--ink-3)' }}>(one per line, or comma-separated: perfect for a ConvertKit export)</span></label>
                <textarea
                    value={blob}
                    onChange={(e) => setBlob(e.target.value)}
                    disabled={importing}
                    rows={4}
                    placeholder={'aiko@example.com\nren@example.com'}
                    className="ak-field__input"
                    style={{ resize: 'vertical', minHeight: '90px' }}
                />
            </div>
            {result && <div className="ak-body-sm" style={{ color: '#1d7a4f' }}>{result}</div>}
            {error && <div className="ak-auth__err">{error}</div>}
            <div>
                <button type="submit" className="ak-btn ak-btn--secondary" disabled={importing || !blob.trim()}>
                    <Upload size={15} /> {importing ? 'Importing…' : 'Import'}
                </button>
            </div>
        </form>
    );
}

function SubscriberList({ subscribers, total }: { subscribers: Subscriber[]; total: number }) {
    return (
        <div className="ak-card ak-card--flush">
            <div className="p-5 pb-3 flex items-center gap-2">
                <span className="ak-title">Subscribers</span>
                {total > subscribers.length && (
                    <span className="ak-caption">showing the latest {subscribers.length}</span>
                )}
            </div>
            {subscribers.length === 0 ? (
                <div className="ak-empty">
                    <span className="ak-heading">No subscribers yet</span>
                    <span className="ak-caption">Homepage signups land here automatically, or add one above.</span>
                </div>
            ) : (
                <ul>
                    {subscribers.map((s) => (
                        <SubscriberRow key={s.id} subscriber={s} />
                    ))}
                </ul>
            )}
        </div>
    );
}

function SubscriberRow({ subscriber }: { subscriber: Subscriber }) {
    const router = useRouter();
    const [removing, setRemoving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const active = subscriber.status === 'subscribed';

    async function remove() {
        if (!confirm(`Unsubscribe ${subscriber.email}? They will stop receiving broadcasts.`)) return;
        setRemoving(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/email/subscribers', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ id: subscriber.id }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) throw new Error(json.error || `Failed (HTTP ${res.status})`);
            router.refresh();
        } catch (e: any) {
            setError(e?.message || 'Could not unsubscribe');
            setRemoving(false);
        }
    }

    return (
        <li className="flex flex-col gap-1 px-5 py-3" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <div style={{ minWidth: 0 }}>
                    <span className="ak-body-sm" style={{ wordBreak: 'break-all', fontWeight: 500 }}>{subscriber.email}</span>
                    {subscriber.name && <span className="ak-caption" style={{ marginLeft: 8 }}>{subscriber.name}</span>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <span
                        className="ak-caption"
                        style={{
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: active ? 'rgba(29, 122, 79, 0.12)' : 'rgba(140, 140, 140, 0.14)',
                            color: active ? '#1d7a4f' : 'var(--ink-3)',
                        }}
                    >
                        {subscriber.status}
                    </span>
                    {active && (
                        <button className="ak-btn ak-btn--ghost ak-btn--sm" onClick={remove} disabled={removing} title="Unsubscribe">
                            <UserX size={14} /> {removing ? '…' : 'Unsubscribe'}
                        </button>
                    )}
                </div>
            </div>
            <span className="ak-caption">
                Joined {formatDate(subscriber.createdAt)}{subscriber.source ? ` via ${subscriber.source}` : ''}
            </span>
            {error && <div className="ak-auth__err">{error}</div>}
        </li>
    );
}
