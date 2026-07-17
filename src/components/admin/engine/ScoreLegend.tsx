'use client';

import { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

/**
 * "How scoring works" legend. A small button that opens a popup explaining the
 * /100 point system, so the score shown on each post is always legible. Static
 * reference reflecting the approved model (franchise/tier + video quality lead,
 * 75 = auto-publish). Kept in sync by hand with the scoring code.
 */

const COMPONENTS: { label: string; max: number; detail: string }[] = [
    { label: 'Franchise / Tier', max: 40, detail: 'Tier 1 = 40, Tier 2 = 30, Tier 3 = 20, new original from a winner studio = 12, untracked = 0.' },
    { label: 'Video Quality', max: 25, detail: '1080p+ real motion = 25, 720-1080p = 15, fake (Ken-Burns still) = 5, image = 0. Below 720p auto-rejects.' },
    { label: 'Category', max: 20, detail: 'Trailer = 20, season announcement = 17, release date = 12, key visual = 6, cast = 3, other = reject.' },
    { label: 'Format', max: 8, detail: 'True 9:16 video reel = 8, fake-motion = 3, static image = 1.' },
    { label: 'Recency', max: 7, detail: 'Under 2h = 7, under 6h = 5, under 24h = 3, under 48h = 1. Re-scored as a post ages on standby.' },
];

const GATES = [
    'Untracked show: never auto-publishes (held for review).',
    'Below 720p or very low bitrate: auto-rejected regardless of total.',
    'Category "other": rejected.',
    'Faked motion on a real franchise: never auto-publishes.',
];

export default function ScoreLegend() {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="ak-syncm__btn"
                style={{ gap: 6 }}
                title="How the /100 score works"
            >
                <HelpCircle size={14} /> How scoring works
            </button>

            {open && (
                <div
                    onClick={() => setOpen(false)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(10,23,48,0.55)',
                        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', overflowY: 'auto',
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="ak-card"
                        style={{ maxWidth: 560, width: '100%', boxShadow: 'var(--shadow-2, 0 20px 60px rgba(0,0,0,0.35))' }}
                    >
                        <div className="flex items-baseline justify-between" style={{ marginBottom: 4 }}>
                            <span className="ak-overline" style={{ color: 'var(--gold)' }}>How the score works</span>
                            <button onClick={() => setOpen(false)} title="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)' }}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="ak-caption" style={{ marginBottom: 12 }}>
                            Every post is scored out of 100. Franchise and video quality are 65 of the points, so the right show and crisp video decide almost everything.
                        </div>

                        <div className="flex flex-col" style={{ gap: 10 }}>
                            {COMPONENTS.map((c) => (
                                <div key={c.label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                    <span style={{
                                        flexShrink: 0, minWidth: 44, textAlign: 'center', borderRadius: 7, padding: '3px 6px',
                                        background: 'var(--surface-2)', border: '1px solid var(--line)',
                                        fontFamily: 'var(--ak-display)', fontWeight: 800, fontSize: '0.85rem', color: 'var(--ink)',
                                    }}>{c.max}</span>
                                    <div style={{ minWidth: 0 }}>
                                        <div className="ak-body-sm" style={{ fontWeight: 700, color: 'var(--ink)' }}>{c.label}</div>
                                        <div className="ak-caption" style={{ marginTop: 1 }}>{c.detail}</div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ borderTop: '1px solid var(--line)', margin: '14px 0 10px' }} />
                        <div className="ak-overline" style={{ marginBottom: 8 }}>Cutoffs</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginBottom: 12 }}>
                            <span className="ak-body-sm"><strong style={{ color: '#35a877' }}>75+</strong> auto-publish</span>
                            <span className="ak-body-sm"><strong style={{ color: '#d9a441' }}>55-74</strong> review</span>
                            <span className="ak-body-sm"><strong style={{ color: '#d0605a' }}>under 55</strong> reject</span>
                        </div>

                        <div className="ak-overline" style={{ marginBottom: 8 }}>Hard gates (override the total)</div>
                        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {GATES.map((g) => (
                                <li key={g} className="ak-caption" style={{ listStyle: 'disc' }}>{g}</li>
                            ))}
                        </ul>

                        <div className="ak-caption" style={{ marginTop: 12, fontStyle: 'italic' }}>
                            Posts 3x/day, one per peak slot. The 3 highest-scoring candidates win; the next best wait on standby and are re-scored as they age.
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
