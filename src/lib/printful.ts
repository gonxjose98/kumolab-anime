
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
