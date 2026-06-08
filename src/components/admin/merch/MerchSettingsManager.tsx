'use client';

/**
 * MerchSettingsManager
 *
 * One row per Printful product. The operator sets:
 *   - Featured (storefront shows featured-only)
 *   - Anchor price (cosmetic struck-through "was" price)
 *   - Label (e.g. "Launch price")
 *
 * The CHARGED price is always Printful's live price (shown, read-only). Save is
 * blocked client-side AND server-side unless the anchor is strictly above the
 * live price — so a fake "discount" that's really a markup can never publish,
 * and the displayed price can never drift from what Printful/Stripe charges.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface MerchRow {
    product_id: string;
    name: string;
    image: string;
    livePrice: number;       // live Printful retail_price (the charged price)
    isFeatured: boolean;
    anchorPrice: number | null;
    label: string | null;
}

function Row({ row }: { row: MerchRow }) {
    const router = useRouter();
    const [featured, setFeatured] = useState(row.isFeatured);
    const [anchor, setAnchor] = useState(row.anchorPrice != null ? String(row.anchorPrice) : '');
    const [label, setLabel] = useState(row.label || '');
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    const anchorNum = anchor.trim() === '' ? null : Number(anchor);
    const anchorInvalid =
        anchor.trim() !== '' && (!Number.isFinite(anchorNum as number) || (anchorNum as number) <= row.livePrice);
    const pct = anchorNum && anchorNum > row.livePrice
        ? Math.round((1 - row.livePrice / anchorNum) * 100)
        : 0;

    async function save() {
        setSaving(true);
        setMsg(null);
        try {
            const res = await fetch('/api/admin/merch-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    product_id: row.product_id,
                    is_featured: featured,
                    anchor_price: anchor.trim() === '' ? null : anchorNum,
                    label: label.trim() || null,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json.success === false) throw new Error(json.error || `Save failed (HTTP ${res.status})`);
            setMsg({ kind: 'ok', text: 'Saved' });
            router.refresh();
        } catch (e: any) {
            setMsg({ kind: 'err', text: e?.message || 'Save failed' });
        } finally {
            setSaving(false);
        }
    }

    return (
        <div
            className="flex flex-col md:flex-row md:items-center gap-4 p-4 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={row.image} alt={row.name} width={56} height={56} style={{ borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />

            <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{row.name}</div>
                <div className="text-xs opacity-70">
                    Printful price (charged): <strong>${row.livePrice.toFixed(2)}</strong>
                    {anchorNum && anchorNum > row.livePrice && (
                        <span style={{ marginLeft: 8, color: '#7af0a8' }}>
                            shows as <s style={{ opacity: 0.6 }}>${anchorNum.toFixed(2)}</s> ${row.livePrice.toFixed(2)} (-{pct}%)
                        </span>
                    )}
                </div>
            </div>

            <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
                Featured
            </label>

            <div className="flex flex-col">
                <input
                    value={anchor}
                    onChange={(e) => setAnchor(e.target.value)}
                    placeholder="Anchor $"
                    inputMode="decimal"
                    className="px-2 py-1 rounded text-sm w-24 outline-none"
                    style={{
                        background: 'rgba(0,0,0,0.4)',
                        border: `1px solid ${anchorInvalid ? '#ff5566' : 'rgba(255,255,255,0.12)'}`,
                        color: '#fff',
                    }}
                />
                {anchorInvalid && (
                    <span style={{ color: '#ff8888', fontSize: 10, marginTop: 2, maxWidth: 120 }}>
                        Must be &gt; ${row.livePrice.toFixed(2)}
                    </span>
                )}
            </div>

            <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label (e.g. Launch price)"
                className="px-2 py-1 rounded text-sm w-40 outline-none"
                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}
            />

            <div className="flex items-center gap-2">
                <button
                    onClick={save}
                    disabled={saving || anchorInvalid}
                    className="px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg, #00d4ff, #7b61ff)', color: '#06121f' }}
                >
                    {saving ? '…' : 'Save'}
                </button>
                {msg && (
                    <span style={{ fontSize: 11, color: msg.kind === 'ok' ? '#7af0a8' : '#ff8888' }}>{msg.text}</span>
                )}
            </div>
        </div>
    );
}

export default function MerchSettingsManager({ rows }: { rows: MerchRow[] }) {
    if (!rows.length) {
        return <p className="opacity-70 text-sm">No Printful products found.</p>;
    }
    return (
        <div className="flex flex-col gap-3">
            {rows.map((r) => <Row key={r.product_id} row={r} />)}
        </div>
    );
}
