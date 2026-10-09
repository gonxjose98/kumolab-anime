'use client';

import { useState } from 'react';
import InsightCard from './InsightCard';
import type { InsightRow } from '@/lib/explore/types';

export interface Glance {
    platform: string;
    last: number;
    prior: number;
    change: number | null;
    through: string;
}

const PNAME: Record<string, string> = { instagram: 'Instagram', threads: 'Threads', website: 'Website', x: 'X' };
const nf = (n: number) => Math.round(n).toLocaleString('en-US');

function Empty({ title, line }: { title: string; line: string }) {
    return (
        <div className="ak-card ak-xp-empty">
            <span className="ak-heading">{title}</span>
            <span className="ak-caption">{line}</span>
        </div>
    );
}

/** Deterministic numbers straight from daily_views, shown when no AI cards exist. */
function GlanceList({ rows }: { rows: Glance[] }) {
    if (!rows.length) return null;
    return (
        <div className="ak-card ak-xp-glance">
            <span className="ak-overline">Views, last 7 days vs prior 7</span>
            <ul>
                {rows.map((r) => (
                    <li key={r.platform}>
                        <span className="ak-xp-glance__name">{PNAME[r.platform] ?? r.platform}</span>
                        <span className="ak-xp-glance__num">{nf(r.last)}</span>
                        <span className={`ak-xp-glance__chg${r.change !== null && r.change < 0 ? ' is-down' : ' is-up'}`}>
                            {r.change === null ? 'n/a' : `${r.change > 0 ? '+' : ''}${r.change}%`}
                        </span>
                        <span className="ak-caption ak-xp-glance__thru">through {r.through}</span>
                    </li>
                ))}
            </ul>
            <span className="ak-caption">From daily views. No AI involved.</span>
        </div>
    );
}

export default function ExploreSections({ world, ours, glance, hasKey, worldHasData }: {
    world: InsightRow[];
    ours: InsightRow[];
    glance: Glance[];
    hasKey: boolean;
    worldHasData: boolean;
}) {
    const [tab, setTab] = useState<'world' | 'ours'>('world');
    const [gone, setGone] = useState<Set<string>>(new Set());
    const dismiss = (id: string) => setGone((s) => new Set(s).add(id));
    const w = world.filter((c) => !gone.has(c.id));
    const o = ours.filter((c) => !gone.has(c.id));

    return (
        <>
            <div className="ak-pills ak-xp-tabs" role="tablist">
                <button role="tab" aria-selected={tab === 'world'} className={`ak-pill ${tab === 'world' ? 'ak-pill--active' : ''}`} onClick={() => setTab('world')}>Anime world</button>
                <button role="tab" aria-selected={tab === 'ours'} className={`ak-pill ${tab === 'ours' ? 'ak-pill--active' : ''}`} onClick={() => setTab('ours')}>Our numbers</button>
            </div>

            <div className="ak-xp-cols">
                <section className={`ak-xp-col${tab === 'world' ? ' is-active' : ''}`} aria-label="Anime world">
                    <div className="ak-overline ak-xp-col__label">Anime world</div>
                    {!worldHasData ? (
                        <Empty title="Coming next" line="Release Radar and Anime Wire are filling in. Trending and News cards start once they have data." />
                    ) : !hasKey ? (
                        <Empty title="Connect Claude to generate insights" line="Release Radar and Anime Wire have data. Cards appear after the Claude key is added." />
                    ) : w.length === 0 ? (
                        <Empty title="Nothing worth your time right now" line="Claude found no story strong enough to flag this run." />
                    ) : (
                        w.map((c) => <InsightCard key={c.id} card={c} onDismiss={dismiss} />)
                    )}
                    <div className="ak-xp-note">
                        <span className="ak-badge ak-badge--bare ak-xp-chip">Community</span>
                        <span className="ak-caption">No chatter source is connected yet (X and Reddit need approval), so there are no community cards.</span>
                    </div>
                </section>

                <section className={`ak-xp-col${tab === 'ours' ? ' is-active' : ''}`} aria-label="Our numbers">
                    <div className="ak-overline ak-xp-col__label">Our numbers</div>
                    {o.length > 0 ? (
                        o.map((c) => <InsightCard key={c.id} card={c} onDismiss={dismiss} />)
                    ) : (
                        <>
                            {!hasKey
                                ? <Empty title="Connect Claude to generate insights" line="Until then, here are the raw numbers." />
                                : <Empty title="Nothing worth your time right now" line="No clear trend in the latest numbers." />}
                            <GlanceList rows={glance} />
                        </>
                    )}
                </section>
            </div>
        </>
    );
}
