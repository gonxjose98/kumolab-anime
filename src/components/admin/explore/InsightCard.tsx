'use client';

import { useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import type { InsightRow } from '@/lib/explore/types';

const TYPE_LABEL: Record<string, string> = {
    news: 'News', trending: 'Trending', premiere: 'Premiere', community: 'Community',
    trend_up: 'Trend', trend_down: 'Trend', format: 'Format', timing: 'Timing',
    top_post: 'Post', followers: 'Followers', system: 'System',
};

const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

/**
 * One Explore card. Collapsed: chips + one-line headline + one-line why.
 * Expanded: details, the labeled recommendation, and every cited source.
 */
export default function InsightCard({ card, onDismiss, compact = false }: { card: InsightRow; onDismiss?: (id: string) => void; compact?: boolean }) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const tone = card.type === 'trend_up' ? 'ak-badge--success' : card.type === 'trend_down' ? 'ak-badge--error' : 'ak-badge--bare ak-xp-chip';

    async function dismiss() {
        if (!onDismiss) return;
        setBusy(true);
        const res = await fetch('/api/admin/explore/insight', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: card.id, action: 'dismiss' }),
        }).catch(() => null);
        setBusy(false);
        if (res?.ok) onDismiss(card.id);
    }

    return (
        <article className={`ak-card ak-xp-card${compact ? ' ak-xp-card--compact' : ''}`}>
            <button type="button" className="ak-xp-card__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                <span className="ak-xp-card__chips">
                    <span className={`ak-badge ${tone}`}>{TYPE_LABEL[card.type] ?? card.type}</span>
                    {card.kind === 'recommendation'
                        ? <span className="ak-badge ak-badge--pending">Recommendation</span>
                        : <span className="ak-badge ak-badge--bare ak-xp-chip">Fact</span>}
                </span>
                <span className="ak-xp-card__title">{card.title}</span>
                <span className="ak-xp-card__why">{card.why}</span>
                <ChevronDown size={16} className={`ak-xp-card__chev${open ? ' is-open' : ''}`} aria-hidden="true" />
            </button>

            {open && (
                <div className="ak-xp-card__body">
                    {card.details && <p className="ak-body-sm">{card.details}</p>}
                    {card.recommendation && (
                        <p className="ak-xp-rec"><span className="ak-xp-rec__label">Recommendation</span>{card.recommendation}</p>
                    )}
                    <div className="ak-xp-sources">
                        <span className="ak-overline">Sources</span>
                        <ul>
                            {card.sources.map((s) => (
                                <li key={s.ref}>
                                    {s.url ? (
                                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="ak-xp-sources__link">
                                            <span>{s.label}</span>
                                            <ExternalLink size={12} aria-hidden="true" />
                                        </a>
                                    ) : (
                                        <span className="ak-xp-sources__label">{s.label}</span>
                                    )}
                                    <span className="ak-caption ak-xp-sources__text">{s.text}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="ak-xp-card__meta">
                        <span className="ak-caption">Confidence: {card.confidence} · {fmtTime(card.created_at)} ET</span>
                        {onDismiss && (
                            <button type="button" className="ak-btn ak-btn--ghost ak-btn--xs" onClick={dismiss} disabled={busy}>
                                {busy ? 'Dismissing' : 'Dismiss'}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </article>
    );
}
