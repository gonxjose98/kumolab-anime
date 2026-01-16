
import { NextResponse } from 'next/server';
import { sendShippingEmail } from '@/lib/email';

export async function POST(req: Request) {
    try {
        const payload = await req.json();
        const { type, data } = payload;

        console.log(`Received Printful Webhook: ${type}`);

        if (type === 'package_shipped') {
            const shipment = data.shipment;
            const trackingNumber = shipment.tracking_number;
            const trackingUrl = shipment.tracking_url; // Keep this for potential future use or logging, though not passed to email
            const carrier = shipment.carrier;
            const orderId = data.order.id; // Keep this for logging
            const externalId = data.order.external_id; // This is our Stripe Session ID
            const recipientEmail = data.order.recipient.email;

            console.log(`Order ${externalId} (${orderId}) shipped via ${carrier}. Tracking: ${trackingNumber}`);

            // LOGIC TO SEND BRANDED EMAIL
            try {
                await sendShippingEmail({
                    to: recipientEmail,
                    orderId: externalId,
                    carrier: carrier,
                    trackingNumber: trackingNumber
                });
            } catch (emailError) {
                console.error('Failed to send shipping email:', emailError);
            }

            // Note: If trackingUrl is Printful-branded, the user wants us to link directly to carrier.
            // Some carriers can be guessed by tracking number formats or handled per Printful data.
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error('Printful Webhook Error:', error);
        return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }
}
