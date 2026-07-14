
const PRINTFUL_API_URL = 'https://api.printful.com';
const ACCESS_TOKEN = process.env.PRINTFUL_ACCESS_TOKEN;

export interface ShippingRecipient {
    country_code: string;
    state_code?: string;
    city?: string;
    zip?: string;
}
export interface ShippingRateItem { variant_id: number; quantity: number }
export interface PrintfulShippingRate {
    id: string;
    name: string;
    rate: string;
    currency: string;
    minDeliveryDays?: number;
    maxDeliveryDays?: number;
}

/**
 * Live Printful shipping rates for a cart to a destination. This is the SOURCE
 * OF TRUTH for the shipping amount the customer is charged, callers (the cart
 * estimate + checkout) must recompute it here server-side and never trust a
 * client-sent shipping value. `items` use catalog variant IDs (resolve a sync
 * variant to its catalog id via getSyncVariantInfo). Throws on any failure so
 * a shipping amount we can't verify never reaches Stripe.
 */
export async function getShippingRates(
    recipient: ShippingRecipient,
    items: ShippingRateItem[],
): Promise<PrintfulShippingRate[]> {
    if (!ACCESS_TOKEN) throw new Error('PRINTFUL_ACCESS_TOKEN is not defined');
    const res = await fetch(`${PRINTFUL_API_URL}/shipping/rates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient, items }),
        cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
        throw new Error(data?.error?.message || `Printful shipping rates failed (HTTP ${res.status})`);
    }
    return (data.result || []) as PrintfulShippingRate[];
}

/** The cheapest (default flat) rate from a Printful rate list, or null. */
export function cheapestRate(rates: PrintfulShippingRate[]): PrintfulShippingRate | null {
    if (!rates?.length) return null;
    return rates.reduce((a, b) => (parseFloat(b.rate) < parseFloat(a.rate) ? b : a));
}

export async function createPrintfulOrder(orderData: any) {
    if (!ACCESS_TOKEN) throw new Error('PRINTFUL_ACCESS_TOKEN is not defined');

    try {
        const response = await fetch(`${PRINTFUL_API_URL}/orders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(orderData),
        });

        const data = await response.json();
        if (!response.ok) {
            console.error('Printful Order Creation Error:', data);
            throw new Error(data.error?.message || 'Failed to create Printful order');
        }

        return data.result;
    } catch (error) {
        console.error('Error creating Printful order:', error);
        throw error;
    }
}

/**
 * Confirm a draft Printful order — this is what actually submits it for
 * fulfillment AND triggers Printful to charge the store's billing method.
 * Called only when the operator approves a paid order (manual-approval flow),
 * so nothing is charged to Jose until he clicks Approve.
 */
export async function confirmPrintfulOrder(orderId: number | string) {
    if (!ACCESS_TOKEN) throw new Error('PRINTFUL_ACCESS_TOKEN is not defined');
    const response = await fetch(`${PRINTFUL_API_URL}/orders/${orderId}/confirm`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        console.error('Printful Order Confirm Error:', data);
        throw new Error(data?.error?.message || `Failed to confirm order ${orderId}`);
    }
    return data.result;
}
