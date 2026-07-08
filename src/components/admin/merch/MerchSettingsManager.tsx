'use client';

/**
 * MerchSettingsManager — Clear Skies
 *
 * One list of every Printful product, in the order they appear on the store.
 * The operator controls placement + pricing here, then hits ONE Save:
 *   - Order   — drag the grip (or ▲▼) to reorder. Drives BOTH the /merch page
 *               and the home Cloud Collection band.
 *   - On home — show this product in the home band.
 *   - Flagship — the single piece that takes the big hero slot on the home band.
 *   - Anchor  — cosmetic struck-through "was" price (must beat the live price).
 *   - Label   — e.g. "Launch price".
 *
 * The CHARGED price is always Printful's live price (shown, read-only). Save is
 * blocked client- AND server-side unless every anchor sits strictly above its
 * live price, so a fake discount can never publish.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GripVertical, ChevronUp, ChevronDown, Star, Home } from 'lucide-react';

export interface MerchRow {
    product_id: string;
    name: string;
    image: string;
    livePrice: number;       // live Printful retail_price (the charged price)
    isFeatured: boolean;
    showOnHome: boolean;
    anchorPrice: number | null;
    label: string | null;
}

interface State {
    product_id: string;
    name: string;
    image: string;
    livePrice: number;
    isFeatured: boolean;
    showOnHome: boolean;
    anchor: string;
    label: string;
}

function toState(r: MerchRow): State {
    return {
        product_id: r.product_id,
        name: r.name,
        image: r.image,
        livePrice: r.livePrice,
        isFeatured: r.isFeatured,
        showOnHome: r.showOnHome,
        anchor: r.anchorPrice != null ? String(r.anchorPrice) : '',
        label: r.label || '',
    };
}

/** Printful names can carry store suffixes — keep them tidy. */
function cleanName(name: string): string {
    return name.replace(/\s*[|·]\s*KumoLab.*$/i, '').trim();
}

export default function MerchSettingsManager({ rows }: { rows: MerchRow[] }) {
    const router = useRouter();
    // Flagship is one big hero slot — if legacy data flagged more than one,
    // keep only the first so the UI reflects the real "pick one" rule.
    const initial = useMemo(() => {
        let seenFlagship = false;
        return rows.map(toState).map((s) => {
            if (s.isFeatured && seenFlagship) return { ...s, isFeatured: false };
            if (s.isFeatured) seenFlagship = true;
            return s;
        });
    }, [rows]);
    const [items, setItems] = useState<State[]>(initial);
    const [dragIdx, setDragIdx] = useState<number | null>(null);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    const dirty = useMemo(
        () => JSON.stringify(items) !== JSON.stringify(initial),
        [items, initial],
    );

    // Anchor validity per row (empty is valid; otherwise must beat live price).
    const invalidRows = items.filter((it) => {
        if (it.anchor.trim() === '') return false;
        const n = Number(it.anchor);
        return !Number.isFinite(n) || n <= it.livePrice;
    });
    const hasInvalid = invalidRows.length > 0;

    function patch(idx: number, next: Partial<State>) {
        setMsg(null);
        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...next } : it)));
    }

    // Flagship is exclusive — one big hero slot, so picking a new flagship
    // clears the others.
    function setFlagship(idx: number, on: boolean) {
        setMsg(null);
        setItems((prev) => prev.map((it, i) => ({ ...it, isFeatured: i === idx ? on : false })));
    }

    function move(from: number, to: number) {
        if (to < 0 || to >= items.length || from === to) return;
        setMsg(null);
        setItems((prev) => {
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next;
        });
    }

    async function save() {
        if (hasInvalid) return;
        setSaving(true);
        setMsg(null);
        try {
            const res = await fetch('/api/admin/merch-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    rows: items.map((it) => ({
                        product_id: it.product_id,
                        is_featured: it.isFeatured,
                        show_on_home: it.showOnHome,
                        anchor_price: it.anchor.trim() === '' ? null : Number(it.anchor),
                        label: it.label.trim() || null,
                    })),
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) throw new Error(json.error || `Save failed (HTTP ${res.status})`);
            setMsg({ kind: 'ok', text: 'All changes saved' });
            router.refresh();
        } catch (e: any) {
            setMsg({ kind: 'err', text: e?.message || 'Save failed' });
        } finally {
            setSaving(false);
        }
    }

    if (!items.length) {
        return (
            <div className="ak-empty">
                <span className="ak-empty__glyph" aria-hidden="true">雲</span>
                <p className="ak-body-sm">No Printful products found.</p>
            </div>
        );
    }

    const homeCount = items.filter((it) => it.showOnHome).length;

    return (
        <div>
            {/* Save bar */}
            <div className="ak-merch__bar">
                <div className="ak-merch__barinfo">
                    <span className="ak-body-sm">
                        <strong>{items.length}</strong> product{items.length === 1 ? '' : 's'}
                        <span className="ak-merch__dot">·</span>
                        <strong>{homeCount || 'none'}</strong> on home
                    </span>
                    {dirty && <span className="ak-merch__unsaved">Unsaved changes</span>}
                </div>
                <div className="flex items-center gap-3">
                    {msg && (
                        <span className={`ak-body-sm ${msg.kind === 'ok' ? 'ak-merch__ok' : 'ak-merch__err'}`}>
                            {msg.text}
                        </span>
                    )}
                    <button
                        className="ak-btn ak-btn--primary"
                        onClick={save}
                        disabled={saving || !dirty || hasInvalid}
                    >
                        {saving ? 'Saving…' : 'Save changes'}
                    </button>
                </div>
            </div>

            {hasInvalid && (
                <p className="ak-merch__warn">
                    {invalidRows.length} anchor price{invalidRows.length === 1 ? '' : 's'} must be higher than the live Printful price before you can save.
                </p>
            )}

            {/* Rows */}
            <div className="ak-merch__list">
                {items.map((it, idx) => {
                    const n = it.anchor.trim() === '' ? null : Number(it.anchor);
                    const anchorInvalid = it.anchor.trim() !== '' && (!Number.isFinite(n as number) || (n as number) <= it.livePrice);
                    const pct = n && n > it.livePrice ? Math.round((1 - it.livePrice / n) * 100) : 0;

                    return (
                        <div
                            key={it.product_id}
                            className={`ak-merch__row ${dragIdx === idx ? 'ak-merch__row--drag' : ''}`}
                            draggable
                            onDragStart={() => setDragIdx(idx)}
                            onDragOver={(e) => {
                                e.preventDefault();
                                if (dragIdx !== null && dragIdx !== idx) {
                                    move(dragIdx, idx);
                                    setDragIdx(idx);
                                }
                            }}
                            onDragEnd={() => setDragIdx(null)}
                        >
                            {/* Order controls */}
                            <div className="ak-merch__handle">
                                <GripVertical size={16} className="ak-merch__grip" />
                                <div className="ak-merch__nudge">
                                    <button aria-label="Move up" onClick={() => move(idx, idx - 1)} disabled={idx === 0}>
                                        <ChevronUp size={14} />
                                    </button>
                                    <button aria-label="Move down" onClick={() => move(idx, idx + 1)} disabled={idx === items.length - 1}>
                                        <ChevronDown size={14} />
                                    </button>
                                </div>
                            </div>

                            <span className="ak-merch__pos">{idx + 1}</span>

                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="ak-merch__thumb" src={it.image} alt="" width={52} height={52} />

                            <div className="ak-merch__meta">
                                <div className="ak-merch__name">{cleanName(it.name)}</div>
                                <div className="ak-merch__price">
                                    Charged <strong>${it.livePrice.toFixed(2)}</strong>
                                    {n && n > it.livePrice && (
                                        <span className="ak-merch__saves">
                                            shows <s>${n.toFixed(2)}</s> → ${it.livePrice.toFixed(2)} (−{pct}%)
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Placement toggles */}
                            <button
                                type="button"
                                className={`ak-merch__chip ${it.showOnHome ? 'ak-merch__chip--on' : ''}`}
                                onClick={() => patch(idx, { showOnHome: !it.showOnHome })}
                                title="Show in the home Cloud Collection band"
                            >
                                <Home size={14} /> Home
                            </button>
                            <button
                                type="button"
                                className={`ak-merch__chip ak-merch__chip--star ${it.isFeatured ? 'ak-merch__chip--on' : ''}`}
                                onClick={() => setFlagship(idx, !it.isFeatured)}
                                title="Flagship — the big hero card on the home band (only one)"
                            >
                                <Star size={14} fill={it.isFeatured ? 'currentColor' : 'none'} /> Flagship
                            </button>

                            {/* Pricing */}
                            <div className="ak-merch__inputs">
                                <div className="ak-merch__anchorwrap">
                                    <input
                                        className={`ak-field__input ak-merch__anchor ${anchorInvalid ? 'ak-merch__anchor--bad' : ''}`}
                                        value={it.anchor}
                                        onChange={(e) => patch(idx, { anchor: e.target.value })}
                                        placeholder="Anchor $"
                                        inputMode="decimal"
                                    />
                                    {anchorInvalid && <span className="ak-merch__hint">&gt; ${it.livePrice.toFixed(2)}</span>}
                                </div>
                                <input
                                    className="ak-field__input ak-merch__label"
                                    value={it.label}
                                    onChange={(e) => patch(idx, { label: e.target.value })}
                                    placeholder="Label"
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
