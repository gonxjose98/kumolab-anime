import { getProduct, getProductSetting } from '@/lib/merch';
import ProductClient from '@/components/merch/ProductClient';
import PageShell from '@/components/home-v3/PageShell';
import pg from '@/components/home-v3/Pages.module.css';
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
        <PageShell active="/merch">
            <div className={pg.wrap}>
                <div className={pg.flowCard}>
                    <ProductClient
                        productData={productData}
                        anchorPrice={setting?.anchor_price ?? null}
                        label={setting?.label ?? null}
                    />
                </div>
            </div>
        </PageShell>
    );
}
