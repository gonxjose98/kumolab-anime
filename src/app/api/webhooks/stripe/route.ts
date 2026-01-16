
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { createPrintfulOrder } from '@/lib/printful';

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

        // Extract shipping and item details
        const shippingDetails = session.shipping_details;
        const customerEmail = session.customer_details?.email;
        const itemsMetadata = JSON.parse(session.metadata?.items || '[]');

        // Construct Printful Order
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
            items: itemsMetadata.map((item: any) => ({
                sync_variant_id: item.variantId,
                quantity: item.quantity,
            })),
            retail_costs: {
                currency: 'USD',
                subtotal: session.amount_subtotal / 100,
                shipping: session.total_details?.amount_shipping / 100,
                total: session.amount_total / 100,
            },
            external_id: session.id, // Link Stripe Session ID to Printful Order
            confirm: true, // Automatically confirm the order for fulfillment
        };

        try {
            await createPrintfulOrder(printfulOrder);
            console.log(`Printful order created for session ${session.id}`);
        } catch (error) {
            console.error(`Failed to create Printful order for session ${session.id}:`, error);
            // In a production app, you'd want to retry or alert here
        }
    }

    return NextResponse.json({ received: true });
}
