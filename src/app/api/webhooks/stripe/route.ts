
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createPrintfulOrder, getPrintfulOrderByExternalId } from '@/lib/printful';
import { recordBuyer, sendOrderConfirmation, type OrderLine } from '@/lib/email/order';

export async function POST(req: Request) {
    const body = await req.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature') as string;

    let event;

    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET || ''
        );
    } catch (err: any) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as any;
        const externalId = session.id as string;

        // IDEMPOTENCY: Stripe delivers events at-least-once (retries), so a
        // redelivery could create a duplicate Printful order. Skip if we've
        // already created one for this session.
        try {
            const existing = await getPrintfulOrderByExternalId(externalId);
            if (existing) {
                console.log(`Printful order already exists for session ${externalId} — skipping`);
                return NextResponse.json({ received: true });
            }
        } catch (e) {
            console.error(`Idempotency check failed for ${externalId}:`, e);
        }

        // AUTHORITATIVE line items: read them back from Stripe (with the
        // variant id we stamped on each product) instead of the metadata
        // string, which is capped at 500 chars and can truncate a big cart
        // into invalid JSON, silently dropping a paid order.
        let items: { sync_variant_id: number; quantity: number }[] = [];
        let displayLines: OrderLine[] = [];
        try {
            const lineItems = await stripe.checkout.sessions.listLineItems(externalId, {
                expand: ['data.price.product'],
                limit: 100,
            });
            items = lineItems.data
                .map((li: any) => {
                    const vid = li.price?.product?.metadata?.variantId;
                    return { sync_variant_id: Number(vid), quantity: li.quantity ?? 1 };
                })
                .filter((i) => Number.isFinite(i.sync_variant_id) && i.sync_variant_id > 0);

            // Human-readable lines for the confirmation email (name + line total).
            displayLines = lineItems.data.map((li: any) => ({
                name: li.description || li.price?.product?.name || 'Item',
                quantity: li.quantity ?? 1,
                amount: (li.amount_total ?? 0) / 100,
            }));

            if (items.length !== lineItems.data.length) {
                console.error(`[stripe webhook] ${externalId}: resolved ${items.length}/${lineItems.data.length} line items — some had no variantId.`);
            }
        } catch (e) {
            console.error(`[stripe webhook] Failed to read line items for ${externalId}:`, e);
        }

        if (items.length === 0) {
            // Customer paid but we can't build the order. Do NOT silently pass:
            // log loudly so it can be reconciled by hand from the Stripe session.
            console.error(`[stripe webhook] PAID session ${externalId} produced NO resolvable items — Printful order NOT created. Needs manual follow-up.`);
            return NextResponse.json({ received: true, warning: 'no resolvable line items' });
        }

        const shippingDetails = session.shipping_details;
        const customerEmail = session.customer_details?.email;

        const printfulOrder = {
            recipient: {
                name: shippingDetails?.name,
                address1: shippingDetails?.address?.line1,
                address2: shippingDetails?.address?.line2,
                city: shippingDetails?.address?.city,
                state_code: shippingDetails?.address?.state,
                country_code: shippingDetails?.address?.country,
                zip: shippingDetails?.address?.postal_code,
                email: customerEmail,
            },
            items,
            retail_costs: {
                currency: 'USD',
                subtotal: session.amount_subtotal / 100,
                shipping: session.total_details?.amount_shipping / 100,
                total: session.amount_total / 100,
            },
            external_id: externalId, // Link Stripe Session ID to Printful Order
            // Manual-approval flow (Jose, 2026-07-11): create as a DRAFT, do NOT
            // auto-confirm. The customer has already paid (funds are in Stripe),
            // but Printful only charges the store when the operator approves the
            // order in the Store tab. This lets Jose verify funds before Printful
            // bills him, and keeps cash flow under his control.
            confirm: false,
        };

        try {
            await createPrintfulOrder(printfulOrder);
            console.log(`Printful order created for session ${externalId}`);
        } catch (error) {
            console.error(`Failed to create Printful order for session ${externalId}:`, error);
            // In a production app, you'd want to retry or alert here
        }

        // The customer has paid, so confirm the order and capture them onto the
        // owned email list regardless of whether the Printful draft succeeded.
        // Both are best-effort (never throw) and run once per session because
        // the idempotency guard above short-circuits Stripe's event retries.
        const orderNumber = externalId.slice(-8).toUpperCase();
        await recordBuyer(customerEmail, shippingDetails?.name);
        await sendOrderConfirmation({
            to: customerEmail,
            name: shippingDetails?.name,
            orderNumber,
            lines: displayLines,
            subtotal: (session.amount_subtotal ?? 0) / 100,
            shipping: (session.total_details?.amount_shipping ?? 0) / 100,
            total: (session.amount_total ?? 0) / 100,
        });
    }

    return NextResponse.json({ received: true });
}
