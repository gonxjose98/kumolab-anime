/**
 * /api/shipping-estimate  (public, read-only)
 *
 * Given the cart items + a destination country, returns the live Printful
 * shipping cost so the cart can show Subtotal / Shipping / Total. This is a
 * quote only, it charges nothing. The same computation is redone server-side
 * in /api/checkout before charging, so a tampered client value can never be
 * billed. Prices resolve from Printful (the source of truth), never the client.
 */

import { NextResponse } from 'next/server';
import { getShippingRates, cheapestRate } from '@/lib/printful';
import { getSyncVariantInfo } from '@/lib/merch';
import { SHIP_COUNTRIES } from '@/lib/shipping';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const { items, countryCode } = await req.json();
        const country = SHIP_COUNTRIES[countryCode];
        if (!country) return NextResponse.json({ error: 'Unsupported shipping country' }, { status: 400 });
        if (!Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: 'No items to estimate' }, { status: 400 });
        }

        // Resolve each cart line (sync variant) to its catalog variant id.
        const rateItems = await Promise.all(
            items.map(async (it: { variantId: number | string; quantity: number }) => {
                const info = await getSyncVariantInfo(it.variantId);
                if (!info?.catalogVariantId) throw new Error('unresolved-variant');
                return { variant_id: info.catalogVariantId, quantity: Math.max(1, Number(it.quantity) || 1) };
            }),
        );

        const rates = await getShippingRates(country.recipient, rateItems);
        const rate = cheapestRate(rates);
        if (!rate) return NextResponse.json({ error: 'No shipping rates available' }, { status: 502 });

        return NextResponse.json({
            shipping: parseFloat(rate.rate),
            currency: rate.currency,
            label: rate.name,
            countryCode,
        });
    } catch (e: any) {
        const msg = e?.message === 'unresolved-variant' ? 'Could not price an item in your cart' : 'Could not estimate shipping';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
