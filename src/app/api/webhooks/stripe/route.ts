
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createPrintfulOrder, getPrintfulOrderByExternalId } from '@/lib/printful';
import { recordBuyer, sendOrderConfirmation, sendCartRecoveryEmail, type OrderLine, type AbandonedCartItem } from '@/lib/email/order';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logError } from '@/lib/logging/structured-logger';

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
            await logError({
                source: 'stripe.webhook',
                errorMessage: `PAID session ${externalId} produced NO resolvable items — Printful order NOT created. Manual reconciliation needed.`,
                context: { sessionId: externalId, amountTotal: (session.amount_total ?? 0) / 100, email: session.customer_details?.email },
            });
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
        } catch (error: any) {
            console.error(`Failed to create Printful order for session ${externalId}:`, error);
            // Paid but not fulfilled — the operator must reconcile from Stripe.
            await logError({
                source: 'stripe.webhook',
                errorMessage: `Failed to create Printful order for PAID session ${externalId}: ${error?.message || error}`,
                stackTrace: error?.stack,
                context: { sessionId: externalId, amountTotal: (session.amount_total ?? 0) / 100, email: customerEmail },
            });
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
    } else if (event.type === 'checkout.session.expired') {
        // ABANDONED-CART RECOVERY (B6): the customer opened checkout, gave an
        // email, then walked away and the session expired. Log it and send ONE
        // recovery email. Everything here is best-effort — this branch must
        // always end in a 200 so Stripe does not retry-storm the endpoint.
        const session = event.data.object as any;
        const sessionId = session.id as string;

        const email = session.customer_details?.email;
        if (!email) {
            // No email captured before abandonment — nothing to recover to.
            return NextResponse.json({ received: true });
        }

        // Items snapshot: the checkout route stamps metadata.items as a
        // JSON string capped at 500 chars, so a big cart can truncate into
        // invalid JSON — parse best-effort and fall back to no item list.
        let items: AbandonedCartItem[] | null = null;
        try {
            const raw = session.metadata?.items;
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) items = parsed;
            }
        } catch {
            console.log(`[stripe webhook] ${sessionId}: metadata.items unparseable (likely truncated) — recovery email will skip the item list`);
        }

        try {
            // IDEMPOTENCY: Stripe delivers events at-least-once. One row per
            // session (unique stripe_session_id); if the row already exists we
            // have already handled (or are handling) this cart — never send a
            // second email. ignoreDuplicates makes the insert race-safe: only
            // the call that actually created the row gets data back.
            const { data: inserted, error: insertError } = await supabaseAdmin
                .from('abandoned_carts')
                .upsert(
                    {
                        email,
                        items,
                        amount: (session.amount_total ?? 0) / 100,
                        currency: session.currency || 'usd',
                        stripe_session_id: sessionId,
                    },
                    { onConflict: 'stripe_session_id', ignoreDuplicates: true },
                )
                .select('id');

            if (insertError) throw insertError;
            if (!inserted || inserted.length === 0) {
                // Row already existed — duplicate delivery, skip the email.
                console.log(`[stripe webhook] abandoned cart already recorded for session ${sessionId} — skipping`);
                return NextResponse.json({ received: true });
            }

            const sent = await sendCartRecoveryEmail(email, items || []);
            if (sent) {
                await supabaseAdmin
                    .from('abandoned_carts')
                    .update({ recovery_sent_at: new Date().toISOString() })
                    .eq('stripe_session_id', sessionId);
            }
        } catch (error: any) {
            // Never throw out of the webhook: log for reconciliation and 200.
            console.error(`[stripe webhook] abandoned-cart handling failed for ${sessionId}:`, error);
            await logError({
                source: 'stripe.webhook',
                errorMessage: `Abandoned-cart recovery failed for expired session ${sessionId}: ${error?.message || error}`,
                stackTrace: error?.stack,
                context: { sessionId, email },
            });
        }
    }

    return NextResponse.json({ received: true });
}
