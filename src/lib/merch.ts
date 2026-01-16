
import { Product } from '@/types';

const PRINTFUL_API_URL = 'https://api.printful.com';
const ACCESS_TOKEN = process.env.PRINTFUL_ACCESS_TOKEN;

export async function getProducts(): Promise<Product[]> {
    if (!ACCESS_TOKEN) {
        console.error('PRINTFUL_ACCESS_TOKEN is not defined');
        return [];
    }

    try {
        const response = await fetch(`${PRINTFUL_API_URL}/sync/products`, {
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
            },
            next: { revalidate: 3600 }
        });

        if (!response.ok) {
            console.error('Printful API Error:', response.statusText);
            return [];
        }

        const data = await response.json();
        const syncProducts = data.result || [];

        const products: Product[] = await Promise.all(
            syncProducts.map(async (p: any) => {
                try {
                    const detailsResponse = await fetch(`${PRINTFUL_API_URL}/sync/products/${p.id}`, {
                        headers: {
                            'Authorization': `Bearer ${ACCESS_TOKEN}`,
                        },
                        next: { revalidate: 3600 }
                    });
                    const detailsData = await detailsResponse.json();
                    const firstVariant = detailsData.result?.sync_variants?.[0];

                    return {
                        id: String(p.id),
                        name: p.name,
                        price: parseFloat(firstVariant?.retail_price || '0'),
                        image: p.thumbnail_url || firstVariant?.files?.find((f: any) => f.type === 'preview')?.thumbnail_url || '',
                        isVisible: true,
                        // Add more fields if needed
                        description: detailsData.result?.sync_product?.name || ''
                    };
                } catch (err) {
                    console.error(`Error fetching details for product ${p.id}:`, err);
                    return null;
                }
            })
        );

        return products.filter((p): p is Product => p !== null && p.isVisible);
    } catch (error) {
        console.error('Error in getProducts:', error);
        return [];
    }
}

export async function getProduct(id: string) {
    if (!ACCESS_TOKEN) return null;

    try {
        const response = await fetch(`${PRINTFUL_API_URL}/sync/products/${id}`, {
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
            },
            next: { revalidate: 60 }
        });

        if (!response.ok) return null;

        const data = await response.json();
        return data.result; // Contains sync_product and sync_variants
    } catch (error) {
        console.error(`Error in getProduct(${id}):`, error);
        return null;
    }
}

export async function getVisibleProducts(): Promise<Product[]> {
    return await getProducts();
}
