import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';

/** The "This week" stat tiles. On phones they sit compactly above the feed. */
export function WeekStats({ insights, needsYou, acted }: { insights: number; needsYou: ReactNode; acted: number }) {
    return (
        <section className="ak-ai-panel ak-ai-stats" aria-label="This week">
            <h2 className="ak-ai-panel__title">This week</h2>
            <div className="ak-ai-tiles">
                <div className="ak-ai-tile"><span className="ak-ai-tile__n">{insights}</span><span className="ak-ai-tile__l">New insights</span></div>
                <div className="ak-ai-tile"><span className="ak-ai-tile__n">{needsYou}</span><span className="ak-ai-tile__l">Need you</span></div>
                <div className="ak-ai-tile"><span className="ak-ai-tile__n">{acted}</span><span className="ak-ai-tile__l">Acted on</span></div>
            </div>
        </section>
    );
}

export interface ViewShare { platform: string; label: string; views: number }

// One hue per platform, same in both themes (chips carry the label, color is secondary).
const PCOLOR: Record<string, string> = { threads: '#8b7cf6', instagram: '#ec5fae', website: '#3fc7a8', x: '#4f9cf0' };

/** Semicircle split by each platform's share of last-7-day views (daily_views). */
function Gauge({ shares }: { shares: ViewShare[] }) {
    const total = shares.reduce((s, x) => s + x.views, 0);
    const R = 64, CX = 80, CY = 76, GAP = 3; // GAP in degrees between segments
    const pt = (deg: number) => {
        const a = (Math.PI * (180 - deg)) / 180; // 0deg = left end, 180deg = right end
        return [CX + R * Math.cos(a), CY - R * Math.sin(a)];
    };
    let at = 0;
    const segs = shares.filter((s) => s.views > 0).map((s) => {
        const span = (s.views / total) * 180;
        const from = at + (at > 0 ? GAP / 2 : 0);
        const to = at + span - (at + span < 179.9 ? GAP / 2 : 0);
        at += span;
        const [x1, y1] = pt(from), [x2, y2] = pt(Math.max(from + 0.5, to));
        return { key: s.platform, d: `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}` };
    });
    return (
        <svg viewBox="0 0 160 86" className="ak-ai-gauge__svg" role="img" aria-label="Share of views by platform, last 7 days">
            <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`} className="ak-ai-gauge__track" />
            {segs.map((s) => <path key={s.key} d={s.d} stroke={PCOLOR[s.key] ?? '#999'} className="ak-ai-gauge__seg" />)}
        </svg>
    );
}

export function WeekBreakdown({ shares, through, topics, note }: {
    shares: ViewShare[];
    through: string | null;
    topics: { label: string; count: number; tone: string }[];
    note: string | null;
}) {
    const total = shares.reduce((s, x) => s + x.views, 0);
    const maxTopic = Math.max(1, ...topics.map((t) => t.count));
    return (
        <section className="ak-ai-breakdown" aria-label="Breakdown">
            {total > 0 && (
                <div className="ak-ai-panel ak-ai-gauge">
                    <div className="ak-ai-panel__sub">Where our views came from, last 7 days</div>
                    <div className="ak-ai-gauge__row">
                        <Gauge shares={shares} />
                        <ul className="ak-ai-legend">
                            {shares.filter((s) => s.views > 0).map((s) => (
                                <li key={s.platform}>
                                    <span className="ak-ai-legend__dot" style={{ background: PCOLOR[s.platform] ?? '#999' }} aria-hidden="true" />
                                    <span className="ak-ai-legend__name">{s.label}</span>
                                    <span className="ak-ai-legend__pct">{s.views / total < 0.01 ? '<1' : Math.round((s.views / total) * 100)}%</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    {through && <div className="ak-ai-panel__foot">From daily views, through {through}. No AI involved.</div>}
                </div>
            )}

            {topics.some((t) => t.count > 0) && (
                <div className="ak-ai-panel ak-ai-bars">
                    <div className="ak-ai-panel__sub">Insights by topic</div>
                    {topics.map((t) => (
                        <div key={t.label} className="ak-ai-bar">
                            <div className="ak-ai-bar__head"><span>{t.label}</span><span className="ak-ai-bar__n">{t.count} {t.count === 1 ? 'insight' : 'insights'}</span></div>
                            <div className="ak-ai-bar__track"><div className={`ak-ai-bar__fill is-${t.tone}`} style={{ width: `${(t.count / maxTopic) * 100}%` }} /></div>
                        </div>
                    ))}
                </div>
            )}

            {note && (
                <div className="ak-ai-panel ak-ai-note">
                    <Sparkles size={16} aria-hidden="true" />
                    <span>{note}</span>
                </div>
            )}
        </section>
    );
}
