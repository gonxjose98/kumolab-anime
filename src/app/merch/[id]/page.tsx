
import { getProduct } from '@/lib/merch';
import ProductClient from '@/components/merch/ProductClient';
import { notFound } from 'next/navigation';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const productData = await getProduct(id);

    if (!productData) {
        notFound();
    }

    return (
        <div className="container mx-auto px-4 py-12 min-h-screen">
            <ProductClient productData={productData} />
        </div>
    );
}
