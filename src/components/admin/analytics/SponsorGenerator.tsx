'use client';

import { useMemo, useState } from 'react';
import { Printer, Camera } from 'lucide-react';
import type { MonthlyReportRow } from '@/lib/analytics/monthly-report';
import { SECTIONS, fmtVal, getVal, monthLabel, type MetricSpec } from '@/lib/analytics/report-metrics';

/**
 * Sponsor kit generator — turns a captured month into a branded one-pager a
 * sponsor can be handed. Pick a month, toggle which platforms/metrics to show
 * (Facebook is off by default — it underperforms and we don't want it dragging
 * a pitch down), name the sponsor, and print to PDF. Only metrics that actually
 * have data for the month are offered, so the sheet never shows a sponsor a "—".
 */

// Facebook excluded by default (weak channel); YouTube has no data yet.
const DEFAULT_EXCLUDE = new Set(['facebook']);

type MetricMap = Record<string, Set<string>>; // section key → set of metric paths

export default function SponsorGenerator({ reports }: { reports: MonthlyReportRow[] }) {
    const [idx, setIdx] = useState(0);
    const row = reports[idx] ?? null;
    const ccy = (row?.business?.currency as string) || 'USD';
    const [sponsor, setSponsor] = useState('');

    // Which metrics have real data this month, grouped by section. Sponsor sheet
    // only ever offers/renders these — no empty rows in an external doc.
    const available = useMemo(() => {
        const map: { key: string; metrics: MetricSpec[] }[] = [];
        for (const s of SECTIONS) {
            const withData = s.metrics.filter((m) => getVal(row, m.path) != null);
            if (withData.length) map.push({ key: s.key, metrics: withData });
        }
        return map;
    }, [row]);

    // Default selection: every available platform except the excluded ones, all
    // their metrics on. Recomputed when the month (→ available set) changes.
    const defaultSelection = useMemo(() => {
        const platforms = new Set<string>();
        const metrics: MetricMap = {};
        for (const { key, metrics: ms } of available) {
            metrics[key] = new Set(ms.map((m) => m.path));
            if (!DEFAULT_EXCLUDE.has(key)) platforms.add(key);
        }
        return { platforms, metrics };
    }, [available]);

    const [sel, setSel] = useState<{ platforms: Set<string>; metrics: MetricMap }>(defaultSelection);
    // Re-seed selection when the available set identity changes (month switch).
    const [seed, setSeed] = useState(defaultSelection);
    if (seed !== defaultSelection) {
        setSeed(defaultSelection);
        setSel({
            platforms: new Set(defaultSelection.platforms),
            metrics: Object.fromEntries(Object.entries(defaultSelection.metrics).map(([k, v]) => [k, new Set(v)])),
        });
    }

    const togglePlatform = (key: string) =>
        setSel((s) => {
            const platforms = new Set(s.platforms);
            platforms.has(key) ? platforms.delete(key) : platforms.add(key);
            return { ...s, platforms };
        });

    const toggleMetric = (key: string, path: string) =>
        setSel((s) => {
            const metrics: MetricMap = { ...s.metrics, [key]: new Set(s.metrics[key]) };
            metrics[key].has(path) ? metrics[key].delete(path) : metrics[key].add(path);
            return { ...s, metrics };
        });

    const applyPreset = (preset: 'standard' | 'instagram' | 'all') =>
        setSel(() => {
            const platforms = new Set<string>();
            const metrics: MetricMap = {};
            for (const { key, metrics: ms } of available) {
                metrics[key] = new Set(ms.map((m) => m.path));
                if (preset === 'all') platforms.add(key);
                else if (preset === 'standard' && !DEFAULT_EXCLUDE.has(key)) platforms.add(key);
                else if (preset === 'instagram' && key === 'instagram') platforms.add(key);
            }
            return { platforms, metrics };
        });

    if (reports.length === 0) {
        return (
            <div className="ak-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <Camera size={22} style={{ color: 'var(--ink-3)', marginBottom: 10 }} />
                <div className="ak-overline" style={{ marginBottom: 6 }}>No months captured yet</div>
                <p className="ak-caption" style={{ maxWidth: 440, margin: '0 auto' }}>
                    Capture a month first (Live view → “Snapshot now”), then build a sponsor sheet from it here.
                </p>
            </div>
        );
    }

    const sectionsToRender = SECTIONS
        .filter((s) => sel.platforms.has(s.key))
        .map((s) => ({
            ...s,
            metrics: (available.find((a) => a.key === s.key)?.metrics || []).filter((m) => sel.metrics[s.key]?.has(m.path)),
        }))
        .filter((s) => s.metrics.length > 0);

    return (
        <div className="ak-spon">
            <style>{`
                @media print {
                    body * { visibility: hidden !important; }
                    .ak-spon__sheet, .ak-spon__sheet * { visibility: visible !important; }
                    .ak-spon__sheet { position: absolute; left: 0; top: 0; width: 100%; margin: 0; box-shadow: none !important; }
                    .ak-no-print { display: none !important; }
                    @page { margin: 14mm; }
                }
                .ak-spon__ctrls { display: grid; gap: 14px; grid-template-columns: 1fr; }
                @media (min-width: 900px) { .ak-spon__ctrls { grid-template-columns: 260px 1fr; } }
                .ak-spon__chk { display: flex; align-items: center; gap: 8px; padding: 3px 0; cursor: pointer; }
                .ak-spon__chk input { accent-color: var(--gold); width: 15px; height: 15px; }
                .ak-spon__mgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 14px; margin: 4px 0 4px 22px; }
                /* The branded sheet uses fixed light colors so the PDF is
                   consistent regardless of the admin's light/dark theme. */
                .ak-spon__sheet { background: #ffffff; color: #16233c; border-radius: 14px; padding: 30px 34px; border: 1px solid #e4e9f2; }
                .ak-spon__tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
                @media (min-width: 620px) { .ak-spon__tiles { grid-template-columns: repeat(3, 1fr); } }
                @media (min-width: 900px) { .ak-spon__tiles { grid-template-columns: repeat(4, 1fr); } }
                .ak-spon__tile { border: 1px solid #e9edf5; border-radius: 10px; padding: 12px 14px; background: #fbfcfe; }
                .ak-spon__tnum { font-family: var(--ak-display); font-weight: 900; font-size: 1.5rem; line-height: 1.05; color: #16233c; font-variant-numeric: tabular-nums; }
                .ak-spon__tlbl { font-size: 0.72rem; letter-spacing: 0.03em; text-transform: uppercase; color: #6b7a94; margin-top: 3px; }
            `}</style>

            {/* Controls */}
            <div className="ak-card ak-no-print" style={{ marginBottom: 16 }}>
                <div className="ak-overline" style={{ marginBottom: 10 }}>Build a sponsor sheet</div>
                <div className="ak-spon__ctrls">
                    {/* Left column: sponsor + month + presets */}
                    <div className="flex flex-col gap-3">
                        <label>
                            <div className="ak-caption" style={{ marginBottom: 4 }}>Sponsor / prepared for</div>
                            <input
                                value={sponsor}
                                onChange={(e) => setSponsor(e.target.value)}
                                placeholder="e.g. Crunchyroll"
                                style={{ width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 11px', color: 'var(--ink)', fontSize: '0.9rem' }}
                            />
                        </label>
                        <div>
                            <div className="ak-caption" style={{ marginBottom: 4 }}>Month</div>
                            <div className="ak-pills" style={{ flexWrap: 'wrap' }}>
                                {reports.map((r, i) => (
                                    <button key={r.month} className={`ak-pill ${i === idx ? 'ak-pill--active' : ''}`} onClick={() => setIdx(i)}>
                                        {new Date(`${r.month.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <div className="ak-caption" style={{ marginBottom: 4 }}>Presets</div>
                            <div className="ak-pills" style={{ flexWrap: 'wrap' }}>
                                <button className="ak-pill" onClick={() => applyPreset('standard')}>Standard (no FB)</button>
                                <button className="ak-pill" onClick={() => applyPreset('instagram')}>Instagram only</button>
                                <button className="ak-pill" onClick={() => applyPreset('all')}>All platforms</button>
                            </div>
                        </div>
                        <button className="ak-syncm__btn" style={{ alignSelf: 'flex-start' }} onClick={() => window.print()}>
                            <Printer size={14} /> Export PDF
                        </button>
                    </div>

                    {/* Right column: platform + metric checkboxes */}
                    <div>
                        <div className="ak-caption" style={{ marginBottom: 6 }}>Include platforms &amp; metrics</div>
                        {available.length === 0 ? (
                            <p className="ak-caption">This month has no measured metrics to show.</p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {available.map(({ key, metrics }) => {
                                    const section = SECTIONS.find((s) => s.key === key)!;
                                    const on = sel.platforms.has(key);
                                    return (
                                        <div key={key} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                                            <label className="ak-spon__chk">
                                                <input type="checkbox" checked={on} onChange={() => togglePlatform(key)} />
                                                <span style={{ fontWeight: 700, color: section.accent }}>{section.title}</span>
                                                <span className="ak-caption">({metrics.length})</span>
                                            </label>
                                            {on && (
                                                <div className="ak-spon__mgrid">
                                                    {metrics.map((m) => (
                                                        <label key={m.path} className="ak-spon__chk">
                                                            <input
                                                                type="checkbox"
                                                                checked={sel.metrics[key]?.has(m.path) ?? false}
                                                                onChange={() => toggleMetric(key, m.path)}
                                                            />
                                                            <span className="ak-body-sm" style={{ color: 'var(--ink-2)' }}>{m.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Live branded preview / the printed sheet */}
            <div className="ak-spon__sheet">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #d9a441', paddingBottom: 14, marginBottom: 20 }}>
                    <div>
                        <div style={{ fontFamily: 'var(--ak-display)', fontWeight: 900, fontSize: '1.5rem', color: '#16233c', letterSpacing: '-0.01em' }}>
                            KumoLab <span style={{ color: '#d9a441' }}>Anime</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#6b7a94', marginTop: 2 }}>Audience &amp; Performance Snapshot</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#16233c' }}>{row ? monthLabel(row.month) : ''}</div>
                        {sponsor.trim() && <div style={{ fontSize: '0.82rem', color: '#6b7a94', marginTop: 2 }}>Prepared for {sponsor.trim()}</div>}
                    </div>
                </div>

                {sectionsToRender.length === 0 ? (
                    <p style={{ color: '#6b7a94', textAlign: 'center', padding: '24px 0' }}>
                        Select at least one platform and metric to build the sheet.
                    </p>
                ) : (
                    <div className="flex flex-col" style={{ gap: 22 }}>
                        {sectionsToRender.map((s) => (
                            <div key={s.key}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                                    <span style={{ width: 12, height: 12, borderRadius: 3, background: s.accent, display: 'inline-block' }} />
                                    <span style={{ fontFamily: 'var(--ak-display)', fontWeight: 800, fontSize: '1.05rem', color: '#16233c' }}>{s.title}</span>
                                </div>
                                <div className="ak-spon__tiles">
                                    {s.metrics.map((m) => (
                                        <div key={m.path} className="ak-spon__tile">
                                            <div className="ak-spon__tnum">{fmtVal(getVal(row, m.path), m.fmt, ccy)}</div>
                                            <div className="ak-spon__tlbl" style={{ color: '#6b7a94' }}>{m.label}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ marginTop: 24, paddingTop: 12, borderTop: '1px solid #e9edf5', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#8a97ac' }}>
                    <span>kumolabanime.com</span>
                    <span>Partnerships · news@kumolabanime.com</span>
                </div>
            </div>
        </div>
    );
}
