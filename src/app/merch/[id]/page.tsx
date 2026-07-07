import Link from 'next/link';
import { getProduct, getProductSetting } from '@/lib/merch';
import ProductClient from '@/components/merch/ProductClient';
import SkyContentRoot from '@/components/sky-content';
import SkyFooter from '@/components/redesign-sky/SkyFooter';
import { notFound } from 'next/navigation';
import styles from './product.module.css';

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
        <SkyContentRoot>
            <div className={styles.wrap}>
                <Link href="/merch" className={styles.back}>
                    <span aria-hidden="true">←</span> The Collection
                </Link>
                <ProductClient
                    productData={productData}
                    anchorPrice={setting?.anchor_price ?? null}
                    label={setting?.label ?? null}
                />
            </div>
            <SkyFooter />
        </SkyContentRoot>
    );
}
