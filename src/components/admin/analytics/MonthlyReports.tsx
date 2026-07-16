'use client';

import { useState } from 'react';
import { Printer, Save, Check, AlertTriangle, Camera } from 'lucide-react';
import type { MonthlyReportRow } from '@/lib/analytics/monthly-report';
import { SECTIONS, fmtVal, getVal, monthLabel } from '@/lib/analytics/report-metrics';

// ── Value / provenance helpers ───────────────────────────────────────────────

function getProv(row: MonthlyReportRow | null, key: string): string {
    return (row?.meta && row.meta[key]) || '';
}

// Provenance → dot color + human label. Exact is a filled green; approximations
// gold; backfilled blue; pending/unavailable muted/hollow.
function provMeta(prov: string): { color: string; label: string; hollow?: boolean } {
    if (prov === 'exact') return { color: '#35a877', label: 'Exact — measured for this month' };
    if (prov === 'trailing30_approx') return { color: '#d9a441', label: 'Approx — 30-day window (Meta cap)' };
    if (prov === 'backfilled_lifetime') return { color: '#3a8be0', label: 'Backfilled — lifetime per-post totals' };
    if (prov === 'pending_ga4') return { color: '#7d8ca8', label: 'Pending — GA4 will fill this next capture', hollow: true };
    if (prov.startsWith('unavailable')) {
        const reason = prov.split(':')[1];
        return { color: '#7d8ca8', label: `Not available${reason ? ` — ${reason.replace(/_/g, ' ')}` : ''}`, hollow: true };
    }
    return { color: '#7d8ca8', label: prov || 'No data', hollow: true };
}

// ── Delta (month over month) ─────────────────────────────────────────────────

function Delta({ cur, prev }: { cur: number | null; prev: number | null }) {
    if (cur == null || prev == null || prev === 0) return null;
    const pct = ((cur - prev) / prev) * 100;
    if (!Number.isFinite(pct) || Math.abs(pct) < 0.5) return null;
    const up = pct >= 0;
    return (
        <span className="ak-mrep__delta" style={{ color: up ? '#35a877' : '#d0605a' }}>
            {up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%
        </span>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MonthlyReports({ reports }: { reports: MonthlyReportRow[] }) {
    const [idx, setIdx] = useState(0);
    const row = reports[idx] ?? null;
    const prev = reports[idx + 1] ?? null; // next-newest = previous month
    const ccy = (row?.business?.currency as string) || 'USD';

    const [analysis, setAnalysis] = useState(row?.analysis || '');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);

    // Switching month loads that row's saved analysis into the editor.
    const selectMonth = (i: number) => {
        setIdx(i);
        setAnalysis(reports[i]?.analysis || '');
        setSaveMsg(null);
    };

    const saveAnalysis = async () => {
        if (!row) return;
        setSaving(true);
        setSaveMsg(null);
        try {
            const res = await fetch('/api/admin/analytics/report-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month: row.month.slice(0, 7), analysis }),
            });
            const data = await res.json();
            if (!res.ok || !data.ok) setSaveMsg({ tone: 'warn', text: data?.reason || 'Save failed.' });
            else setSaveMsg({ tone: 'ok', text: 'Saved' });
        } catch (e: any) {
            setSaveMsg({ tone: 'warn', text: e?.message || 'Network error.' });
        } finally {
            setSaving(false);
        }
    };

    if (reports.length === 0) {
        return (
            <div className="ak-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <Camera size={22} style={{ color: 'var(--ink-3)', marginBottom: 10 }} />
                <div className="ak-overline" style={{ marginBottom: 6 }}>No monthly reports yet</div>
                <p className="ak-caption" style={{ maxWidth: 440, margin: '0 auto' }}>
                    A report is captured automatically on the 1st of each month (covering the month
                    that just ended). To create one now, switch to the Live view and click
                    “Snapshot now”.
                </p>
            </div>
        );
    }

    return (
        <div className="ak-mrep">
            {/* Print isolation: only the report prints, controls/nav hidden. */}
            <style>{`
                @media print {
                    body * { visibility: hidden !important; }
                    .ak-mrep, .ak-mrep * { visibility: visible !important; }
                    .ak-mrep { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
                    .ak-no-print { display: none !important; }
                    .ak-mrep__grid { grid-template-columns: 1fr 1fr !important; }
                    .ak-card { break-inside: avoid; box-shadow: none !important; }
                }
                .ak-mrep__grid { display: grid; gap: 14px; grid-template-columns: 1fr; }
                @media (min-width: 720px) { .ak-mrep__grid { grid-template-columns: 1fr 1fr; } }
                @media (min-width: 1100px) { .ak-mrep__grid { grid-template-columns: 1fr 1fr 1fr; } }
                .ak-mrep__mrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 5px 0; border-bottom: 1px dashed var(--line); }
                .ak-mrep__mrow:last-child { border-bottom: none; }
                .ak-mrep__mlabel { display: flex; align-items: center; gap: 7px; min-width: 0; }
                .ak-mrep__val { font-family: var(--ak-display); font-weight: 800; font-variant-numeric: tabular-nums; color: var(--ink); white-space: nowrap; }
                .ak-mrep__val--empty { color: var(--ink-3); font-weight: 600; }
                .ak-mrep__delta { font-size: 0.72rem; font-weight: 700; font-variant-numeric: tabular-nums; }
                .ak-mrep__dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
                .ak-mrep__accent { height: 4px; border-radius: 3px; margin-bottom: 10px; }
            `}</style>

            {/* Header: month picker + captured date + print */}
            <div className="ak-anctrl ak-no-print" style={{ marginBottom: 16 }}>
                <div className="ak-pills" style={{ flexWrap: 'wrap' }}>
                    {reports.map((r, i) => (
                        <button
                            key={r.month}
                            className={`ak-pill ${i === idx ? 'ak-pill--active' : ''}`}
                            onClick={() => selectMonth(i)}
                        >
                            {new Date(`${r.month.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })}
                        </button>
                    ))}
                </div>
                <div className="ak-anctrl__right">
                    <button className="ak-syncm__btn" onClick={() => window.print()}>
                        <Printer size={14} /> Print / PDF
                    </button>
                </div>
            </div>

            {/* Report title block */}
            <div style={{ marginBottom: 18 }}>
                <div className="ak-overline" style={{ color: 'var(--gold)' }}>KumoLab · Monthly Report</div>
                <h2 style={{ fontFamily: 'var(--ak-display)', fontWeight: 900, fontSize: '1.7rem', lineHeight: 1.1, color: 'var(--ink)', margin: '2px 0 4px' }}>
                    {row ? monthLabel(row.month) : ''}
                </h2>
                <div className="ak-caption">
                    {row?.captured_at ? `Captured ${new Date(row.captured_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                    {prev ? ` · deltas vs ${monthLabel(prev.month)}` : ''}
                </div>
            </div>

            {/* Per-platform metric cards */}
            <div className="ak-mrep__grid">
                {SECTIONS.map((s) => (
                    <div key={s.key} className="ak-card">
                        <div className="ak-mrep__accent" style={{ background: s.accent }} />
                        <div className="flex items-baseline justify-between" style={{ marginBottom: 2 }}>
                            <span className="ak-overline" style={{ color: s.accent, fontWeight: 800 }}>{s.title}</span>
                        </div>
                        <div className="ak-caption" style={{ marginBottom: 8 }}>{s.subtitle}</div>
                        <div>
                            {s.metrics.map((m) => {
                                const v = getVal(row, m.path);
                                const pv = getVal(prev, m.path);
                                const prov = getProv(row, m.prov || m.path);
                                const pm = provMeta(prov);
                                return (
                                    <div key={m.path} className="ak-mrep__mrow">
                                        <span className="ak-mrep__mlabel">
                                            <span
                                                className="ak-mrep__dot"
                                                title={pm.label}
                                                style={{ background: pm.hollow ? 'transparent' : pm.color, border: `1.5px solid ${pm.color}` }}
                                            />
                                            <span className="ak-body-sm truncate" style={{ color: 'var(--ink-2)' }}>{m.label}</span>
                                        </span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Delta cur={v} prev={pv} />
                                            <span className={`ak-mrep__val ${v == null ? 'ak-mrep__val--empty' : ''}`}>
                                                {fmtVal(v, m.fmt, ccy)}
                                            </span>
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Written analysis (editable) */}
            <div className="ak-card" style={{ marginTop: 16 }}>
                <div className="flex items-baseline justify-between" style={{ marginBottom: 10 }}>
                    <span className="ak-overline">Analysis</span>
                    <div className="ak-syncm ak-no-print">
                        <button className="ak-syncm__btn" onClick={saveAnalysis} disabled={saving}>
                            <Save size={13} className={saving ? 'ak-spin' : ''} /> {saving ? 'Saving…' : 'Save'}
                        </button>
                        {saveMsg && (
                            <span className={`ak-syncm__msg ak-syncm__msg--${saveMsg.tone}`}>
                                {saveMsg.tone === 'ok' ? <Check size={13} /> : <AlertTriangle size={13} />}
                                {saveMsg.text}
                            </span>
                        )}
                    </div>
                </div>
                <textarea
                    className="ak-no-print"
                    value={analysis}
                    onChange={(e) => setAnalysis(e.target.value)}
                    rows={4}
                    placeholder="Auto-generated at capture; edit freely — your text is saved until the next snapshot re-derives it."
                    style={{
                        width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)',
                        borderRadius: 10, padding: '10px 12px', color: 'var(--ink)', fontSize: '0.9rem',
                        lineHeight: 1.5, resize: 'vertical',
                    }}
                />
                {/* Print-only rendering of the analysis text */}
                <p style={{ display: 'none', color: 'var(--ink)', lineHeight: 1.6 }} className="ak-mrep__print-analysis">
                    {analysis}
                </p>
            </div>

            {/* Provenance legend */}
            <div className="ak-card" style={{ marginTop: 16 }}>
                <div className="ak-overline" style={{ marginBottom: 8 }}>How to read the dots</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 20px' }}>
                    {[
                        { color: '#35a877', label: 'Exact — measured for this month' },
                        { color: '#d9a441', label: 'Approx — 30-day window (Meta cap)' },
                        { color: '#3a8be0', label: 'Backfilled — lifetime per-post totals' },
                        { color: '#7d8ca8', label: 'Pending / not available', hollow: true },
                    ].map((l) => (
                        <span key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                            <span className="ak-mrep__dot" style={{ background: l.hollow ? 'transparent' : l.color, border: `1.5px solid ${l.color}` }} />
                            <span className="ak-caption">{l.label}</span>
                        </span>
                    ))}
                </div>
            </div>

            <style>{`@media print { .ak-mrep__print-analysis { display: block !important; } textarea.ak-no-print { display: none !important; } }`}</style>
        </div>
    );
}
