
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { CartItem } from '@/store/useCartStore';
import { getSyncVariantInfo } from '@/lib/merch';
import { getShippingRates, cheapestRate } from '@/lib/printful';
import { SHIP_COUNTRIES } from '@/lib/shipping';
import { logError } from '@/lib/logging/structured-logger';

export async function POST(req: Request) {
    try {
        const { items, countryCode } = await req.json();

        if (!items || items.length === 0) {
            return NextResponse.json({ error: 'No items in cart' }, { status: 400 });
        }

        const country = SHIP_COUNTRIES[countryCode];
        if (!country) {
            return NextResponse.json({ error: 'Please choose a shipping country.' }, { status: 400 });
        }

        // SECURITY / PRICE INTEGRITY: never trust client-sent money. The cart
        // lives in the browser, so item.price (and any shipping) is
        // attacker-controllable. Re-resolve each variant's live Printful
        // retail_price AND its catalog id server-side, and recompute shipping
        // from Printful below. If anything can't be verified we abort the whole
        // checkout rather than charge a value we can't stand behind.
        const resolved = await Promise.all(
            items.map(async (item: CartItem) => {
                const info = await getSyncVariantInfo(item.variantId);
                if (info?.retailPrice == null || info.retailPrice <= 0 || !info.catalogVariantId) {
                    throw new Error(`Could not verify "${item.name}". Please refresh and try again.`);
                }
                return { item, info };
            }),
        );

        const lineItems = resolved.map(({ item, info }) => ({
            price_data: {
                currency: 'usd',
                product_data: {
                    name: item.name,
                    images: [item.image],
                    metadata: {
                        productId: item.productId,
                        variantId: item.variantId,
                        size: item.size || '',
                        color: item.color || '',
                    },
                },
                // Authoritative price from Printful, not item.price.
                unit_amount: Math.round(info.retailPrice! * 100),
            },
            quantity: item.quantity,
        }));

        // Authoritative shipping: recompute from Printful for the chosen country
        // (the same call the cart estimate used). Never the client's number.
        const rateItems = resolved.map(({ item, info }) => ({ variant_id: info.catalogVariantId!, quantity: item.quantity }));
        const rate = cheapestRate(await getShippingRates(country.recipient, rateItems));
        if (!rate) {
            await logError({
                source: 'checkout',
                errorMessage: `Shipping rate lookup returned nothing for ${countryCode} — customer blocked at checkout`,
                context: { countryCode, itemCount: items.length },
            });
            return NextResponse.json({ error: 'Could not calculate shipping for that country. Please try again.' }, { status: 502 });
        }
        const shippingCents = Math.round(parseFloat(rate.rate) * 100);

        const session = await stripe.checkout.sessions.create({
            // Embedded UI: the payment + address form renders on our own
            // /merch/checkout page (the customer never leaves the site). On
            // completion Stripe sends them to return_url (our success page).
            ui_mode: 'embedded',
            payment_method_types: ['card'],
            // Let customers enter promotion codes (created in the Stripe
            // dashboard) directly in the embedded checkout form.
            allow_promotion_codes: true,
            line_items: lineItems,
            mode: 'payment',
            return_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/merch/success?session_id={CHECKOUT_SESSION_ID}`,
            // Lock the address to the country we quoted so the shipping we
            // charge always matches the destination.
            shipping_address_collection: {
                allowed_countries: [countryCode],
            },
            shipping_options: [
                {
                    shipping_rate_data: {
                        display_name: 'Shipping',
                        type: 'fixed_amount',
                        fixed_amount: { amount: shippingCents, currency: 'usd' },
                    },
                },
            ],
            metadata: {
                // Store a stringified version of items for the webhook
                items: JSON.stringify(items.map((i: CartItem) => ({
                    variantId: i.variantId,
                    quantity: i.quantity,
                    name: i.name
                }))).substring(0, 500) // Stripe metadata limit
            }
        });

        return NextResponse.json({ clientSecret: session.client_secret });
    } catch (error: any) {
        console.error('Checkout Error:', error);
        await logError({
            source: 'checkout',
            errorMessage: `Checkout session creation failed: ${error?.message || error}`,
            stackTrace: error?.stack,
        });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
