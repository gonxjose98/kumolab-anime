'use client';

import { useEffect, useMemo, useState } from 'react';
import { Save, Check, AlertTriangle, ChevronDown, Eye, EyeOff, RotateCcw, Zap } from 'lucide-react';
import type { SystemEmailTemplate } from '@/lib/email/templates';

/**
 * "System emails" section of the admin Email tab: the four automated emails
 * (order confirmation, cart recovery, The Forecast, welcome), each with its
 * wording editable inline. The branded layout is fixed in code; only the copy
 * changes. Preview renders server-side with sample data (the exact renderer
 * the real sends use) into a sandboxed iframe, and refreshes live as you type.
 */

type Copy = Record<string, string>;

export default function SystemEmails({ templates }: { templates: SystemEmailTemplate[] }) {
    return (
        <div className="ak-card ak-card--flush">
            <div className="p-5 pb-3 flex flex-col gap-1">
                <span className="ak-title">System emails</span>
                <span className="ak-caption">
                    The emails KumoLab sends automatically. Edit the wording here; the design stays on-brand.
                    Leave a field matching the default and it keeps following future default improvements.
                </span>
            </div>
            {templates.map((t) => (
                <TemplateRow key={t.key} template={t} />
            ))}
        </div>
    );
}

function TemplateRow({ template: t }: { template: SystemEmailTemplate }) {
    const [open, setOpen] = useState(false);
    const [copy, setCopy] = useState<Copy>({ ...t.copy });
    const [baseline, setBaseline] = useState<Copy>({ ...t.copy });
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
    const [showPreview, setShowPreview] = useState(false);
    const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    const dirty = t.fields.some((f) => (copy[f.id] ?? '') !== (baseline[f.id] ?? ''));
    const customized = t.fields.some((f) => (baseline[f.id] ?? '') !== (t.defaults[f.id] ?? ''));
    const copyJson = useMemo(() => JSON.stringify(copy), [copy]);

    // Live preview: (re)render on open and, debounced, on every copy edit.
    useEffect(() => {
        if (!showPreview) return;
        let cancelled = false;
        setPreviewLoading(true);
        const id = setTimeout(async () => {
            try {
                const res = await fetch('/api/admin/email/templates', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ action: 'preview', key: t.key, fields: JSON.parse(copyJson) }),
                });
                const json = await res.json().catch(() => ({}));
                if (!cancelled && json.ok) setPreview({ subject: json.subject, html: json.html });
            } catch {
                // Preview is best-effort; the last rendered frame stays up.
            } finally {
                if (!cancelled) setPreviewLoading(false);
            }
        }, 350);
        return () => {
            cancelled = true;
            clearTimeout(id);
        };
    }, [showPreview, t.key, copyJson]);

    async function save() {
        setSaving(true);
        setMsg(null);
        try {
            const res = await fetch('/api/admin/email/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ action: 'save', key: t.key, fields: copy }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.ok) {
                setMsg({ tone: 'warn', text: json?.reason || 'Save failed.' });
            } else {
                const next: Copy = json.copy && typeof json.copy === 'object' ? json.copy : copy;
                setCopy({ ...next });
                setBaseline({ ...next });
                setMsg({ tone: 'ok', text: 'Saved' });
            }
        } catch (e: any) {
            setMsg({ tone: 'warn', text: e?.message || 'Network error.' });
        } finally {
            setSaving(false);
        }
    }

    const setField = (id: string, value: string) => {
        setCopy((c) => ({ ...c, [id]: value }));
        setMsg(null);
    };

    return (
        <div style={{ borderTop: '1px solid var(--line)' }}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex items-center justify-between gap-3 w-full px-5 py-3"
                style={{ background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }}
                aria-expanded={open}
            >
                <div style={{ minWidth: 0 }}>
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="ak-body-sm" style={{ fontWeight: 600, color: 'var(--ink)' }}>{t.name}</span>
                        {customized && (
                            <span
                                className="ak-caption"
                                style={{ padding: '1px 8px', borderRadius: '999px', background: 'rgba(212, 164, 62, 0.14)', color: 'var(--gold-text)' }}
                            >
                                customized
                            </span>
                        )}
                    </div>
                    <span className="ak-caption" style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Zap size={11} style={{ flexShrink: 0 }} /> {t.fires}
                    </span>
                </div>
                <ChevronDown
                    size={16}
                    style={{ flexShrink: 0, color: 'var(--ink-3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }}
                />
            </button>

            {open && (
                <div className="px-5 pb-4 flex flex-col gap-3">
                    {t.note && (
                        <div className="ak-caption" style={{ color: 'var(--gold-text)' }}>{t.note}</div>
                    )}
                    {t.fields.map((f) => (
                        <div className="ak-field" key={f.id}>
                            <label className="ak-field__label">{f.label}</label>
                            {f.multiline ? (
                                <textarea
                                    value={copy[f.id] ?? ''}
                                    onChange={(e) => setField(f.id, e.target.value)}
                                    disabled={saving}
                                    rows={2}
                                    placeholder={t.defaults[f.id] ?? ''}
                                    className="ak-field__input"
                                    style={{ resize: 'vertical', minHeight: '56px' }}
                                />
                            ) : (
                                <input
                                    type="text"
                                    value={copy[f.id] ?? ''}
                                    onChange={(e) => setField(f.id, e.target.value)}
                                    disabled={saving}
                                    placeholder={t.defaults[f.id] ?? ''}
                                    className="ak-field__input"
                                />
                            )}
                            {f.hint && <p className="ak-caption" style={{ marginTop: 4 }}>{f.hint}</p>}
                        </div>
                    ))}

                    <div className="flex items-center gap-2 flex-wrap">
                        <button className="ak-btn ak-btn--primary ak-btn--sm" onClick={save} disabled={saving || !dirty}>
                            <Save size={14} /> {saving ? 'Saving…' : 'Save wording'}
                        </button>
                        <button
                            className="ak-btn ak-btn--secondary ak-btn--sm"
                            onClick={() => setShowPreview((p) => !p)}
                            disabled={saving}
                        >
                            {showPreview ? <EyeOff size={14} /> : <Eye size={14} />} {showPreview ? 'Hide preview' : 'Preview'}
                        </button>
                        {(customized || dirty) && (
                            <button
                                className="ak-btn ak-btn--ghost ak-btn--sm"
                                onClick={() => { setCopy({ ...t.defaults }); setMsg(null); }}
                                disabled={saving}
                                title="Put the default wording back in the fields (save to apply)"
                            >
                                <RotateCcw size={14} /> Use defaults
                            </button>
                        )}
                        {msg && (
                            <span className={`ak-syncm__msg ak-syncm__msg--${msg.tone}`}>
                                {msg.tone === 'ok' ? <Check size={13} /> : <AlertTriangle size={13} />}
                                {msg.text}
                            </span>
                        )}
                    </div>

                    {showPreview && (
                        <div className="flex flex-col gap-2" style={{ minWidth: 0 }}>
                            <span className="ak-caption" style={{ wordBreak: 'break-word' }}>
                                Subject: <strong style={{ color: 'var(--ink-2)' }}>{preview?.subject ?? '…'}</strong>
                                {previewLoading ? ' · updating…' : ''}
                            </span>
                            <div style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', background: '#eef5fc' }}>
                                <iframe
                                    title={`${t.name} preview`}
                                    sandbox=""
                                    srcDoc={preview?.html ?? '<p style="font-family:sans-serif;color:#8aa3bd;padding:24px;">Rendering preview…</p>'}
                                    style={{ display: 'block', width: '100%', height: 520, border: 0 }}
                                />
                            </div>
                            <span className="ak-caption">
                                Rendered with sample data by the exact template the real send uses.
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
