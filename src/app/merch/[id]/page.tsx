
import { getProduct, getProductSetting } from '@/lib/merch';
import ProductClient from '@/components/merch/ProductClient';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const [productData, setting] = await Promise.all([
        getProduct(id),
        getProductSetting(id),
    ]);

    if (!productData) {
        notFound();
    }

    return (
        <div className="container mx-auto px-4 py-12 min-h-screen">
            <ProductClient
                productData={productData}
                anchorPrice={setting?.anchor_price ?? null}
                label={setting?.label ?? null}
            />
        </div>
    );
}
