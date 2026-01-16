
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { CartItem } from '@/store/useCartStore';

export async function POST(req: Request) {
    try {
        const { items } = await req.json();

        if (!items || items.length === 0) {
            return NextResponse.json({ error: 'No items in cart' }, { status: 400 });
        }

        const lineItems = items.map((item: CartItem) => ({
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
                unit_amount: Math.round(item.price * 100),
            },
            quantity: item.quantity,
        }));

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/merch/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/merch`,
            shipping_address_collection: {
                allowed_countries: ['US', 'CA', 'GB', 'AU'], // Expand as needed
            },
            metadata: {
                // Store a stringified version of items for the webhook
                items: JSON.stringify(items.map((i: CartItem) => ({
                    variantId: i.variantId,
                    quantity: i.quantity,
                    name: i.name
                }))).substring(0, 500) // Stripe metadata limit
            }
        });

        return NextResponse.json({ sessionId: session.id, url: session.url });
    } catch (error: any) {
        console.error('Checkout Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
