/**
 * /api/admin/merch-settings
 *
 * Admin control for the storefront display overrides (merch_settings):
 *   - is_featured  — flagship: takes the big hero slot on the home band
 *   - show_on_home — whether the product appears in the home Cloud Collection band
 *   - sort_order   — manual display order (shared by /merch and the home band)
 *   - anchor_price — the cosmetic struck-through compare-at price
 *   - label        — e.g. 'Launch price'
 *
 * THE GUARD (Jose's rule): you cannot save a price that doesn't match Printful.
 * The real (charged) price is ALWAYS Printful's live retail_price — it's never
 * stored here, so it can't drift. The only price the operator sets is the
 * cosmetic anchor, and we reject the save unless the anchor sits strictly ABOVE
 * the live Printful price (otherwise it's a markup masquerading as a discount,
 * not a real "was" price). Live prices are re-fetched server-side here, so the
 * client cannot spoof them.
 *
 * Two payload shapes:
 *   • BULK  { rows: [{ product_id, is_featured, show_on_home, sort_order,
 *             anchor_price, label }, ...] }  — the merch manager's single Save.
 *   • SINGLE { product_id, is_featured, anchor_price, label }  — legacy, kept
 *             so nothing else that posts one row breaks.
 *
 * Auth: middleware gates /api/admin/* by Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getProduct, getProducts } from '@/lib/merch';

export const dynamic = 'force-dynamic';

/** Parse + clamp an anchor value. Returns { value } or { error }. */
function parseAnchor(raw: unknown): { value: number | null } | { error: string } {
    if (raw == null || raw === '') return { value: null };
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return { error: 'Anchor price must be a positive number.' };
    }
    return { value: Math.round(parsed * 100) / 100 };
}

function cleanLabel(raw: unknown): string | null {
    return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 60) : null;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));

        // ── BULK: one Save persists placement + pricing for every product ──
        if (Array.isArray(body?.rows)) {
            const rows: any[] = body.rows;
            if (rows.length === 0) {
                return NextResponse.json({ success: true, saved: 0 });
            }

            // One catalogue fetch gives every live (charged) price — the source
            // of truth for the anchor guard, un-spoofable by the client.
            const catalogue = await getProducts();
            const liveById = new Map(catalogue.map((p) => [String(p.id), p.price]));

            const upserts: any[] = [];
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                const product_id = r?.product_id != null ? String(r.product_id) : '';
                if (!product_id) {
                    return NextResponse.json({ success: false, error: `Row ${i + 1} is missing product_id.` }, { status: 400 });
                }

                const anchorParsed = parseAnchor(r?.anchor_price);
                if ('error' in anchorParsed) {
                    return NextResponse.json({ success: false, error: `${product_id}: ${anchorParsed.error}` }, { status: 400 });
                }
                const anchor_price = anchorParsed.value;

                // THE GUARD — anchor must sit above the live Printful price.
                if (anchor_price != null) {
                    const livePrice = liveById.get(product_id);
                    if (livePrice == null || !Number.isFinite(livePrice)) {
                        return NextResponse.json(
                            { success: false, error: `Could not resolve "${product_id}" on Printful — cannot validate its anchor.` },
                            { status: 502 },
                        );
                    }
                    if (anchor_price <= livePrice) {
                        return NextResponse.json(
                            {
                                success: false,
                                error: `Anchor ($${anchor_price.toFixed(2)}) must be higher than the live Printful price ($${livePrice.toFixed(2)}). The charged price is always Printful's — the anchor is the cosmetic "was" price.`,
                            },
                            { status: 400 },
                        );
                    }
                }

                upserts.push({
                    product_id,
                    is_featured: !!r?.is_featured,
                    show_on_home: !!r?.show_on_home,
                    // Canonical order = position in the submitted list.
                    sort_order: i,
                    anchor_price,
                    label: cleanLabel(r?.label),
                    updated_at: new Date().toISOString(),
                });
            }

            const { error } = await supabaseAdmin
                .from('merch_settings')
                .upsert(upserts, { onConflict: 'product_id' });
            if (error) {
                return NextResponse.json({ success: false, error: `DB save failed: ${error.message}` }, { status: 500 });
            }

            return NextResponse.json({ success: true, saved: upserts.length });
        }

        // ── SINGLE (legacy) ────────────────────────────────────────────────
        const product_id = body?.product_id != null ? String(body.product_id) : '';
        const is_featured = !!body?.is_featured;
        const label = cleanLabel(body?.label);

        const anchorParsed = parseAnchor(body?.anchor_price);
        if ('error' in anchorParsed) {
            return NextResponse.json({ success: false, error: anchorParsed.error }, { status: 400 });
        }
        const anchor_price = anchorParsed.value;

        if (!product_id) {
            return NextResponse.json({ success: false, error: 'product_id is required' }, { status: 400 });
        }

        const productData = await getProduct(product_id);
        const livePriceRaw = productData?.sync_variants?.[0]?.retail_price;
        const livePrice = parseFloat(livePriceRaw);
        if (!productData || !Number.isFinite(livePrice)) {
            return NextResponse.json(
                { success: false, error: 'Could not resolve this product on Printful — cannot validate price.' },
                { status: 502 },
            );
        }

        if (anchor_price != null && anchor_price <= livePrice) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Anchor ($${anchor_price.toFixed(2)}) must be higher than the live Printful price ($${livePrice.toFixed(2)}). The charged price is always Printful's — the anchor is the cosmetic "was" price.`,
                    livePrice,
                },
                { status: 400 },
            );
        }

        const { error } = await supabaseAdmin.from('merch_settings').upsert({
            product_id,
            is_featured,
            anchor_price,
            label,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'product_id' });

        if (error) {
            return NextResponse.json({ success: false, error: `DB save failed: ${error.message}` }, { status: 500 });
        }

        return NextResponse.json({ success: true, product_id, is_featured, anchor_price, label, livePrice });
    } catch (e: any) {
        console.error('[merch-settings] error', e);
        return NextResponse.json({ success: false, error: e?.message || 'Internal error' }, { status: 500 });
    }
}
