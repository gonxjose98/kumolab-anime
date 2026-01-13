import { Product } from '@/types';

const PRINTFUL_API_URL = 'https://api.printful.com';
const ACCESS_TOKEN = process.env.PRINTFUL_ACCESS_TOKEN || '1ON6VZfS80oFN0G1wIirbtylS0gcOCx7KVTBkD1j';

export async function getProducts(): Promise<Product[]> {
    try {
        const response = await fetch(`${PRINTFUL_API_URL}/sync/products`, {
            headers: {
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
            },
            next: { revalidate: 3600 } // Cache for 1 hour
        });

        if (!response.ok) {
            console.error('Printful API Error:', response.statusText);
            return [];
        }

        const data = await response.json();
        const syncProducts = data.result || [];

        // For each product, fetch details to get the price and preview image
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

                    // Construct a Printful Store link if it's a native store product
                    // Note: This is an assumption based on the "native" store type found earlier.
                    const storeSlug = 'kumolab-originals';
                    const productLink = `https://${storeSlug}.printful.me/product/${p.id}`;

                    return {
                        id: String(p.id),
                        name: p.name,
                        price: parseFloat(firstVariant?.retail_price || '0'),
                        image: p.thumbnail_url || firstVariant?.files?.find((f: any) => f.type === 'preview')?.thumbnail_url || '',
                        link: productLink,
                        isVisible: true
                    };
                } catch (err) {
                    console.error(`Error fetching details for product ${p.id}:`, err);
                    return {
                        id: String(p.id),
                        name: p.name,
                        price: 0,
                        image: p.thumbnail_url || '',
                        link: '#',
                        isVisible: false
                    };
                }
            })
        );

        return products.filter(p => p.isVisible);
    } catch (error) {
        console.error('Error in getProducts:', error);
        return [];
    }
}

export async function getVisibleProducts(): Promise<Product[]> {
    return await getProducts();
}
