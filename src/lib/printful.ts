
const PRINTFUL_API_URL = 'https://api.printful.com';
const ACCESS_TOKEN = process.env.PRINTFUL_ACCESS_TOKEN;

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
