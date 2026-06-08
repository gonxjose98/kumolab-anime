/**
 * /api/admin/merch-settings
 *
 * Admin control for the storefront display overrides (merch_settings):
 *   - is_featured  — whether the product shows on /merch (single-hero model)
 *   - anchor_price — the cosmetic struck-through compare-at price
 *   - label        — e.g. 'Launch price'
 *
 * THE GUARD (Jose's rule): you cannot save a price that doesn't match Printful.
 * The real (charged) price is ALWAYS Printful's live retail_price — it's never
 * stored here, so it can't drift. The only price the operator sets is the
 * cosmetic anchor, and we reject the save unless the anchor sits strictly ABOVE
 * the live Printful price (otherwise it's a markup masquerading as a discount,
 * not a real "was" price). The live price is re-fetched server-side here, so the
 * client cannot spoof it.
 *
 * Auth: middleware gates /api/admin/* by Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getProduct } from '@/lib/merch';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const product_id = body?.product_id != null ? String(body.product_id) : '';
        const is_featured = !!body?.is_featured;
        const label = typeof body?.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 60) : null;

        let anchor_price: number | null = null;
        if (body?.anchor_price != null && body.anchor_price !== '') {
            const parsed = Number(body.anchor_price);
            if (!Number.isFinite(parsed) || parsed <= 0) {
                return NextResponse.json({ success: false, error: 'Anchor price must be a positive number.' }, { status: 400 });
            }
            anchor_price = Math.round(parsed * 100) / 100;
        }

        if (!product_id) {
            return NextResponse.json({ success: false, error: 'product_id is required' }, { status: 400 });
        }

        // Resolve the LIVE Printful price (source of truth for what's charged).
        const productData = await getProduct(product_id);
        const livePriceRaw = productData?.sync_variants?.[0]?.retail_price;
        const livePrice = parseFloat(livePriceRaw);
        if (!productData || !Number.isFinite(livePrice)) {
            return NextResponse.json(
                { success: false, error: 'Could not resolve this product on Printful — cannot validate price.' },
                { status: 502 },
            );
        }

        // THE GUARD: an anchor only makes sense ABOVE the real (charged) price.
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
