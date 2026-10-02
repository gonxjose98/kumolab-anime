'use client';

import { useState } from 'react';
import { Printer, Save, Check, AlertTriangle, Camera, ChevronDown } from 'lucide-react';
import type { MonthlyReportRow } from '@/lib/analytics/monthly-report';
import { SECTIONS, fmtVal, getVal, monthLabel, type Section } from '@/lib/analytics/report-metrics';

// ── Value / provenance helpers ───────────────────────────────────────────────

function getProv(row: MonthlyReportRow | null, key: string): string {
    return (row?.meta && row.meta[key]) || '';
}

// Provenance → dot color + human label. Exact is a filled green; approximations
// gold; backfilled blue; pending/unavailable muted/hollow.
function provMeta(prov: string): { color: string; label: string; hollow?: boolean } {
    if (prov === 'exact') return { color: '#35a877', label: 'Exact, measured for this month' };
    if (prov === 'trailing30_approx') return { color: '#d9a441', label: 'Approx, 30-day window (Meta cap)' };
    if (prov === 'backfilled_lifetime') return { color: '#3a8be0', label: 'Backfilled, lifetime per-post totals' };
    if (prov === 'pending_ga4') return { color: '#7d8ca8', label: 'Pending, GA4 fills this next capture', hollow: true };
    if (prov.startsWith('unavailable')) {
        const reason = prov.split(':')[1];
        return { color: '#7d8ca8', label: `Not available${reason ? `, ${reason.replace(/_/g, ' ')}` : ''}`, hollow: true };
    }
    return { color: '#7d8ca8', label: prov || 'No data', hollow: true };
}

const LEGEND = [
    { color: '#35a877', label: 'Exact, measured for this month' },
    { color: '#d9a441', label: 'Approx, 30-day window (Meta cap)' },
    { color: '#3a8be0', label: 'Backfilled, lifetime per-post totals' },
    { color: '#7d8ca8', label: 'Pending or not available', hollow: true },
];

const sumVals = (row: MonthlyReportRow | null, paths: string[]) => {
    const vals = paths.map((p) => getVal(row, p)).filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
};

function Delta({ cur, prev }: { cur: number | null; prev: number | null }) {
    if (cur == null || prev == null || prev === 0) return null;
    const pct = ((cur - prev) / prev) * 100;
    if (!Number.isFinite(pct) || Math.abs(pct) < 0.5) return null;
    const up = pct >= 0;
    return <span className={`ak-mrep__delta ${up ? 'ak-mrep__delta--up' : 'ak-mrep__delta--down'}`}>{up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%</span>;
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

    // Hero card mirrors the Live tab: total views + one tile per platform.
    const tiles: { key: string; label: string; color: string; views: string | null; followers?: string }[] = [
        { key: 'threads', label: 'Threads', color: '#24365c', views: 'threads.views', followers: 'threads.followers' },
        { key: 'instagram', label: 'Instagram', color: '#e0457b', views: 'instagram.views', followers: 'instagram.followers' },
        { key: 'website', label: 'Website', color: '#16a3a6', views: 'website.pageviews' },
        { key: 'x', label: 'X', color: '#9aa3b2', views: null },
        { key: 'facebook', label: 'Facebook', color: '#4267B2', views: 'facebook.views', followers: 'facebook.followers' },
        { key: 'tiktok', label: 'TikTok', color: '#111', views: null },
        { key: 'youtube', label: 'YouTube', color: '#d0433a', views: 'youtube.views', followers: 'youtube.subscribers' },
    ];
    const viewPaths = tiles.map((t) => t.views).filter((v): v is string => !!v);
    const total = sumVals(row, viewPaths);
    const prevTotal = sumVals(prev, viewPaths);
    const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k` : String(n));
    const card = (k: string) => {
        const s = SECTIONS.find((x) => x.key === k);
        return s ? <PlatformCard key={k} s={s} row={row} prev={prev} ccy={ccy} /> : null;
    };

    return (
        <div className="ak-mrep">
            <style>{`
                @media print {
                    body * { visibility: hidden !important; }
                    .ak-mrep, .ak-mrep * { visibility: visible !important; }
                    .ak-mrep { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
                    .ak-no-print { display: none !important; }
                    .ak-card { break-inside: avoid; box-shadow: none !important; }
                    .ak-mrep__print-analysis { display: block !important; }
                }
            `}</style>

            {/* Hero card: same layout as the Live tab's total views card */}
            <div className="ak-card ak-mrep__head">
                <div className="ak-an__hero">
                    <div>
                        <div className="ak-overline">Total views · {row ? monthLabel(row.month) : ''}</div>
                        <div className="ak-an__big">{fmtVal(total, 'int', ccy)}</div>
                        <div className="ak-caption" style={{ marginTop: 4 }}>
                            <Delta cur={total} prev={prevTotal} /> {prev ? `vs ${monthLabel(prev.month)}` : ''}
                            {row?.captured_at ? ` · captured ${new Date(row.captured_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                        </div>
                    </div>
                    <div className="ak-an__herotools ak-no-print">
                        <label className="ak-mrep__select">
                            <span className="sr-only">Report month</span>
                            <select value={idx} onChange={(e) => selectMonth(Number(e.target.value))}>
                                {reports.map((r, i) => <option key={r.month} value={i}>{monthLabel(r.month)}</option>)}
                            </select>
                            <ChevronDown size={14} />
                        </label>
                        <button className="ak-syncm__btn ak-mrep__print" onClick={() => window.print()} title="Print / save as PDF" aria-label="Print / save as PDF">
                            <Printer size={15} />
                        </button>
                    </div>
                </div>
                <div className="ak-an__tiles">
                    {tiles.map((t) => {
                        const v = t.views ? getVal(row, t.views) : null;
                        const pv = t.views ? getVal(prev, t.views) : null;
                        const f = t.followers ? getVal(row, t.followers) : null;
                        const has = v != null;
                        const share = has && total ? Math.round((v / total) * 100) : 0;
                        return (
                            <div key={t.key} className={`ak-an__tile ${has ? '' : 'ak-an__tile--off'}`} style={{ ['--tile' as any]: t.color, cursor: 'default' }}>
                                <span className="ak-an__tilehead"><i />{t.label}</span>
                                {has ? (
                                    <>
                                        <span className="ak-an__tilenum">{compact(v)}</span>
                                        <span className="ak-an__tilesub"><Delta cur={v} prev={pv} /><span>{share}% of total</span></span>
                                        {f != null && <span className="ak-caption">{f.toLocaleString('en-US')} {t.key === 'youtube' ? 'subscribers' : 'followers'}</span>}
                                    </>
                                ) : (
                                    <span className="ak-caption" style={{ marginTop: 6 }}>Not tracked this month</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Card grid: each row stretches its cards to one height. */}
            <div className="ak-mrep__grid">
                {card('instagram')}
                {card('website')}
                <div className="ak-mrep__stack">
                    {card('threads')}
                    {card('facebook')}
                </div>
                <div className="ak-mrep__stack">
                    <div className="ak-card ak-mrep__analysis">
                        <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                            <span className="ak-overline">Analysis</span>
                            <div className="ak-syncm ak-no-print">
                                {saveMsg && (
                                    <span className={`ak-syncm__msg ak-syncm__msg--${saveMsg.tone}`}>
                                        {saveMsg.tone === 'ok' ? <Check size={13} /> : <AlertTriangle size={13} />}
                                        {saveMsg.text}
                                    </span>
                                )}
                                <button className="ak-syncm__btn" onClick={saveAnalysis} disabled={saving}>
                                    <Save size={13} className={saving ? 'ak-spin' : ''} /> {saving ? 'Saving…' : 'Save'}
                                </button>
                            </div>
                        </div>
                        <textarea
                            className="ak-no-print ak-mrep__textarea"
                            value={analysis}
                            onChange={(e) => setAnalysis(e.target.value)}
                            placeholder="Auto-generated at capture; edit freely. Your text is kept until the next snapshot re-derives it."
                        />
                        <p className="ak-mrep__print-analysis">{analysis}</p>
                    </div>
                    {card('business')}
                    {card('youtube')}
                </div>
            </div>
            <div className="ak-mrep__legend ak-no-print">
                {LEGEND.map((l) => (
                    <span key={l.label}>
                        <span className="ak-mrep__dot" style={{ background: l.hollow ? 'transparent' : l.color, border: `1.5px solid ${l.color}` }} />
                        {l.label}
                    </span>
                ))}
            </div>
        </div>
    );
}

function PlatformCard({ s, row, prev, ccy }: { s: Section; row: MonthlyReportRow | null; prev: MonthlyReportRow | null; ccy: string }) {
    const empty = s.metrics.every((m) => getVal(row, m.path) == null);
    // Nothing measured yet: a slim placeholder so it doesn't stretch its row.
    if (empty) {
        return (
            <div className="ak-card ak-mrep__pcard ak-mrep__pcard--empty ak-mrep__pcard--slim">
                <div className="ak-mrep__pname"><i style={{ background: s.accent }} /><strong>{s.title}</strong></div>
                <div className="ak-caption">Not connected yet</div>
            </div>
        );
    }
    return (
        <div className={`ak-card ak-mrep__pcard ${empty ? 'ak-mrep__pcard--empty' : ''}`}>
            <div className="ak-mrep__pname"><i style={{ background: s.accent }} /><strong>{s.title}</strong></div>
            <div className="ak-mrep__psub">{s.subtitle}</div>
            <div>
                {s.metrics.map((m) => {
                    const v = getVal(row, m.path);
                    const pv = getVal(prev, m.path);
                    const pm = provMeta(getProv(row, m.prov || m.path));
                    return (
                        <div key={m.path} className="ak-mrep__metric" title={pm.label}>
                            <span className="ak-mrep__mlabel">
                                <span className="ak-mrep__dot" style={{ background: pm.hollow ? 'transparent' : pm.color, border: `1.5px solid ${pm.color}` }} />
                                {m.label}
                            </span>
                            <span className="ak-mrep__mval">
                                <Delta cur={v} prev={pv} />
                                <strong className={v == null ? 'ak-mrep__val--empty' : ''}>{fmtVal(v, m.fmt, ccy)}</strong>
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
