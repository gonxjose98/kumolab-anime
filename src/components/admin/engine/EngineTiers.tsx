'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown, X, Plus, Loader2, AlertTriangle } from 'lucide-react';
import type { AnimeTier } from '@/lib/engine/anime-tiers';

/**
 * Engine → Tiers. The visible control surface for the pipeline's posting
 * priority. Three sections (one per tier); inside each, anime are grouped by
 * studio. Move an anime up/down to change the tier the engine works off.
 */

const TIER_META: Record<number, { label: string; accent: string; blurb: string }> = {
    1: { label: 'Tier 1 · Own it', accent: '#d9a441', blurb: 'Cover every news beat. Proven KumoLab winners or franchises too big to miss.' },
    2: { label: 'Tier 2 · Add for reach', accent: '#3a8be0', blurb: 'Big global fanbases to capture. Roughly one slot a day.' },
    3: { label: 'Tier 3 · Opportunistic', accent: '#8a94a6', blurb: 'Pre-air hype windows and short-term trending spikes.' },
};

type Busy = { id: string; kind: 'move' | 'remove' } | null;

export default function EngineTiers({ initialTiers }: { initialTiers: AnimeTier[] }) {
    const [tiers, setTiers] = useState<AnimeTier[]>(initialTiers);
    const [busy, setBusy] = useState<Busy>(null);
    const [err, setErr] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState({ anime: '', studio: '', tier: 2 });

    const post = async (payload: Record<string, unknown>) => {
        const res = await fetch('/api/admin/engine/tiers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data?.reason || 'Request failed');
        return data;
    };

    const move = async (row: AnimeTier, dir: -1 | 1) => {
        const nextTier = row.tier + dir;
        if (nextTier < 1 || nextTier > 3) return;
        setBusy({ id: row.id, kind: 'move' });
        setErr(null);
        const prev = tiers;
        setTiers((t) => t.map((r) => (r.id === row.id ? { ...r, tier: nextTier } : r))); // optimistic
        try {
            await post({ action: 'setTier', id: row.id, tier: nextTier });
        } catch (e: any) {
            setTiers(prev);
            setErr(e?.message || 'Could not move that anime.');
        } finally {
            setBusy(null);
        }
    };

    const remove = async (row: AnimeTier) => {
        setBusy({ id: row.id, kind: 'remove' });
        setErr(null);
        const prev = tiers;
        setTiers((t) => t.filter((r) => r.id !== row.id)); // optimistic
        try {
            await post({ action: 'remove', id: row.id });
        } catch (e: any) {
            setTiers(prev);
            setErr(e?.message || 'Could not remove that anime.');
        } finally {
            setBusy(null);
        }
    };

    const add = async () => {
        const anime = form.anime.trim();
        if (!anime) return;
        setAdding(true);
        setErr(null);
        try {
            await post({ action: 'add', anime, studio: form.studio.trim() || null, tier: form.tier });
            // Refetch to get the server-generated id/order.
            const res = await fetch('/api/admin/engine/tiers');
            const data = await res.json();
            if (data?.tiers) setTiers(data.tiers);
            setForm({ anime: '', studio: '', tier: form.tier });
        } catch (e: any) {
            setErr(e?.message || 'Could not add that anime.');
        } finally {
            setAdding(false);
        }
    };

    return (
        <div className="flex flex-col gap-5 min-w-0">
            {err && (
                <div className="ak-card" style={{ borderColor: 'var(--sun)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <AlertTriangle size={15} style={{ color: 'var(--sun)', flexShrink: 0 }} />
                    <span className="ak-body-sm" style={{ color: 'var(--ink)' }}>{err}</span>
                </div>
            )}

            {/* Add anime */}
            <div className="ak-card">
                <div className="ak-overline" style={{ marginBottom: 10 }}>Add an anime to the tiers</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
                    <label style={{ flex: '2 1 200px', minWidth: 0 }}>
                        <div className="ak-caption" style={{ marginBottom: 4 }}>Anime</div>
                        <input value={form.anime} onChange={(e) => setForm({ ...form, anime: e.target.value })}
                            placeholder="e.g. Jujutsu Kaisen S3" style={inp} />
                    </label>
                    <label style={{ flex: '1 1 140px', minWidth: 0 }}>
                        <div className="ak-caption" style={{ marginBottom: 4 }}>Studio</div>
                        <input value={form.studio} onChange={(e) => setForm({ ...form, studio: e.target.value })}
                            placeholder="e.g. MAPPA" style={inp} />
                    </label>
                    <label style={{ flex: '0 1 90px', minWidth: 0 }}>
                        <div className="ak-caption" style={{ marginBottom: 4 }}>Tier</div>
                        <select value={form.tier} onChange={(e) => setForm({ ...form, tier: Number(e.target.value) })} style={inp}>
                            <option value={1}>Tier 1</option>
                            <option value={2}>Tier 2</option>
                            <option value={3}>Tier 3</option>
                        </select>
                    </label>
                    <button className="ak-syncm__btn" onClick={add} disabled={adding || !form.anime.trim()}>
                        {adding ? <Loader2 size={14} className="ak-spin" /> : <Plus size={14} />} Add
                    </button>
                </div>
            </div>

            {/* Tier sections */}
            {[1, 2, 3].map((tier) => {
                const meta = TIER_META[tier];
                const rows = tiers.filter((r) => r.tier === tier);
                // Group by studio (alpha), untitled studios last.
                const byStudio = new Map<string, AnimeTier[]>();
                for (const r of rows) {
                    const key = r.studio?.trim() || '(no studio)';
                    if (!byStudio.has(key)) byStudio.set(key, []);
                    byStudio.get(key)!.push(r);
                }
                const studios = [...byStudio.keys()].sort((a, b) =>
                    a === '(no studio)' ? 1 : b === '(no studio)' ? -1 : a.localeCompare(b));

                return (
                    <div key={tier} className="ak-card">
                        <div style={{ height: 4, borderRadius: 3, background: meta.accent, marginBottom: 12 }} />
                        <div className="flex items-baseline justify-between" style={{ gap: 8, flexWrap: 'wrap' }}>
                            <span className="ak-overline" style={{ color: meta.accent, fontWeight: 800 }}>{meta.label}</span>
                            <span className="ak-caption">{rows.length} anime</span>
                        </div>
                        <div className="ak-caption" style={{ marginBottom: 12 }}>{meta.blurb}</div>

                        {rows.length === 0 ? (
                            <div className="ak-caption" style={{ padding: '10px 0', textAlign: 'center' }}>Nothing in this tier.</div>
                        ) : (
                            <div className="flex flex-col" style={{ gap: 14 }}>
                                {studios.map((studio) => (
                                    <div key={studio}>
                                        <div style={{ fontFamily: 'var(--ak-display)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--ink-2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                                            {studio}
                                        </div>
                                        <div className="flex flex-col" style={{ gap: 6 }}>
                                            {byStudio.get(studio)!.map((row) => {
                                                const moving = busy?.id === row.id;
                                                return (
                                                    <div key={row.id} className="ak-uprow" style={{ padding: '8px 10px', gap: 10, alignItems: 'center' }}>
                                                        <div style={{ minWidth: 0, flex: 1 }}>
                                                            <div className="ak-body-sm" style={{ fontWeight: 600, color: 'var(--ink)' }}>{row.anime}</div>
                                                            {row.note && <div className="ak-caption" style={{ marginTop: 1 }}>{row.note}</div>}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                                                            <button title="Move up a tier" onClick={() => move(row, -1)} disabled={tier === 1 || moving} style={iconBtn(tier === 1)}>
                                                                <ChevronUp size={16} />
                                                            </button>
                                                            <button title="Move down a tier" onClick={() => move(row, 1)} disabled={tier === 3 || moving} style={iconBtn(tier === 3)}>
                                                                <ChevronDown size={16} />
                                                            </button>
                                                            <button title="Remove from tiers" onClick={() => remove(row)} disabled={moving} style={iconBtn(false)}>
                                                                {moving && busy?.kind === 'remove' ? <Loader2 size={14} className="ak-spin" /> : <X size={14} />}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

const inp: React.CSSProperties = {
    width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)',
    borderRadius: 9, padding: '8px 10px', color: 'var(--ink)', fontSize: '0.9rem',
};

function iconBtn(disabled: boolean): React.CSSProperties {
    return {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, borderRadius: 8, border: '1px solid var(--line)',
        background: 'var(--surface)', color: disabled ? 'var(--ink-3)' : 'var(--ink-2)',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
    };
}
