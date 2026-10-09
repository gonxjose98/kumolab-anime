'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { SystemReport } from '@/lib/explore/system';
import type { InsightRow } from '@/lib/explore/types';
import InsightCard from './InsightCard';

function ago(iso: string | null | undefined): string {
    if (!iso) return 'never';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 3_600_000) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
    return `${Math.floor(ms / 86_400_000)}d ago`;
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });

const DOT: Record<string, string> = { ok: 'ok', warn: 'warn', crit: 'crit', unknown: 'idle', missing: 'idle' };

/**
 * The only System element on the Explore page: one line. Token reminders reach
 * this line only inside a 30/14/7/3/2/1-day window; everything else waits in
 * the drawer.
 */
export default function SystemPill({ report, cards }: { report: SystemReport; cards: InsightRow[] }) {
    const [open, setOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    }, [open]);

    const n = report.needsYou.length;
    const worst = report.needsYou.some((i) => i.level === 'crit') ? 'crit' : n ? 'warn' : 'ok';
    const firstToken = report.needsYou.find((i) => i.kind === 'token');
    const label = n === 0 ? 'All systems normal' : `${n} thing${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} you`;
    const enabledSources = report.sources.filter((s) => s.is_enabled !== false);

    const drawer = (
        <div className="admin-root ak-xp-portal">
            <div className="ak-xp-scrim" onClick={() => setOpen(false)} />
            <aside className="ak-xp-drawer" role="dialog" aria-modal="true" aria-label="System">
                <div className="ak-xp-drawer__head">
                    <div>
                        <div className="ak-overline">System</div>
                        <div className="ak-title">{label}</div>
                        <div className="ak-caption">Checked {ago(report.checkedAt)}</div>
                    </div>
                    <button type="button" className="ak-btn ak-btn--ghost ak-btn--xs" onClick={() => setOpen(false)} aria-label="Close">
                        <X size={16} />
                    </button>
                </div>

                {n > 0 && (
                    <section className="ak-xp-dsec">
                        <div className="ak-overline">Needs you</div>
                        <ul className="ak-xp-list">
                            {report.needsYou.map((i) => (
                                <li key={i.key}><span className={`ak-xp-dot ak-xp-dot--${i.level}`} aria-hidden="true" /><span className="ak-body-sm">{i.text}</span></li>
                            ))}
                        </ul>
                    </section>
                )}

                {cards.length > 0 && (
                    <section className="ak-xp-dsec">
                        <div className="ak-overline">Claude&apos;s read</div>
                        {cards.map((c) => <InsightCard key={c.id} card={c} compact />)}
                    </section>
                )}

                <section className="ak-xp-dsec">
                    <div className="ak-overline">Tokens and keys</div>
                    <ul className="ak-xp-list">
                        {report.tokens.map((t) => (
                            <li key={t.key} className="ak-xp-token">
                                <span className={`ak-xp-dot ak-xp-dot--${DOT[t.level] ?? 'idle'}`} aria-hidden="true" />
                                <div className="min-w-0">
                                    <div className="ak-xp-token__row">
                                        <span className="ak-body-sm ak-xp-token__name">{t.label}</span>
                                        <span className="ak-caption ak-xp-token__when">
                                            {t.daysLeft !== null && t.expiresAt
                                                ? `${t.daysLeft} day${t.daysLeft === 1 ? '' : 's'} · ${day(t.expiresAt)}`
                                                : t.level === 'missing' ? 'Not set' : t.level === 'unknown' ? 'Unknown' : 'No expiry'}
                                        </span>
                                    </div>
                                    <div className="ak-caption">{t.detail}</div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="ak-xp-dsec">
                    <div className="ak-overline">Health checks</div>
                    <ul className="ak-xp-list">
                        {report.health.checks.map((c) => (
                            <li key={c.key}><span className={`ak-xp-dot ak-xp-dot--${c.level}`} aria-hidden="true" /><span className="ak-body-sm"><strong>{c.label}</strong> <span className="ak-caption">{c.detail}</span></span></li>
                        ))}
                    </ul>
                </section>

                <details className="ak-xp-dsec ak-xp-fold">
                    <summary><span className="ak-overline">Sources</span><span className="ak-caption">{report.sourcesHealthy}/{enabledSources.length} healthy</span></summary>
                    <ul className="ak-xp-list">
                        {report.sources.map((s) => {
                            const lvl = s.is_enabled === false ? 'idle' : (s.consecutive_failures ?? 0) >= 3 ? 'crit' : (s.consecutive_failures ?? 0) > 0 ? 'warn' : 'ok';
                            return (
                                <li key={s.source_name}><span className={`ak-xp-dot ak-xp-dot--${lvl}`} aria-hidden="true" /><span className="ak-body-sm ak-xp-grow">{s.source_name}</span><span className="ak-caption">{s.is_enabled === false ? 'off' : `ok ${ago(s.last_success)}`}</span></li>
                            );
                        })}
                    </ul>
                </details>

                <details className="ak-xp-dsec ak-xp-fold">
                    <summary><span className="ak-overline">Errors, last 24h</span><span className="ak-caption">{report.errors24h}</span></summary>
                    {report.errors.length === 0 ? <p className="ak-caption">No errors.</p> : (
                        <ul className="ak-xp-list">
                            {report.errors.map((e) => (
                                <li key={e.id} className="ak-xp-log"><span className="ak-caption ak-xp-log__t">{ago(e.created_at)}</span><span className="ak-body-sm ak-xp-grow"><strong>{e.source}</strong> <span className="ak-caption">{(e.error_message || '').slice(0, 160)}</span></span></li>
                            ))}
                        </ul>
                    )}
                </details>

                <details className="ak-xp-dsec ak-xp-fold">
                    <summary><span className="ak-overline">Scraper activity</span><span className="ak-caption">latest {report.activity.length}</span></summary>
                    <ul className="ak-xp-list">
                        {report.activity.map((a, i) => (
                            <li key={i} className="ak-xp-log"><span className="ak-caption ak-xp-log__t">{ago(a.created_at)}</span><span className="ak-body-sm ak-xp-grow ak-xp-trunc">{a.candidate_title}</span><span className="ak-caption">{(a.decision || '').replace(/_/g, ' ')}</span></li>
                        ))}
                    </ul>
                </details>
            </aside>
        </div>
    );

    return (
        <>
            <button type="button" className={`ak-xp-pill ak-xp-pill--${worst}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
                <span className={`ak-xp-dot ak-xp-dot--${worst}`} aria-hidden="true" />
                <span className="ak-xp-pill__text">
                    {label}
                    {firstToken && <span className="ak-xp-pill__sub"> · {firstToken.text}</span>}
                </span>
                <span className="ak-xp-pill__more">Details</span>
            </button>
            {open && mounted && createPortal(drawer, document.body)}
        </>
    );
}
