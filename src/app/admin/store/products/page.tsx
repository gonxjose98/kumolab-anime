import { getProducts } from '@/lib/merch';
import MerchSettingsManager, { type MerchRow } from '@/components/admin/merch/MerchSettingsManager';

export const dynamic = 'force-dynamic';

export default async function StoreProductsPage() {
    // getProducts() merges live Printful price + merch_settings and returns the
    // catalogue already in the operator's saved order (sort_order).
    const products = await getProducts();

    const rows: MerchRow[] = products.map((p) => ({
        product_id: p.id,
        name: p.name,
        image: p.image,
        livePrice: p.price,
        isFeatured: !!p.isFeatured,
        showOnHome: !!p.showOnHome,
        anchorPrice: p.anchorPrice ?? null,
        label: p.label ?? null,
    }));

    return (
        <div>
            <div className="ak-card" style={{ marginBottom: '18px', maxWidth: '760px' }}>
                <p className="ak-body-sm" style={{ margin: 0 }}>
                    Arrange how merch appears across the store. <strong>Drag</strong> (or use ▲▼) to set the order
                    the products show in, on both the <strong>Shop</strong> page and the homepage. Flip <strong>Home</strong>
                    {' '}to feature a piece in the homepage band, and pick one <strong>Flagship</strong> for the big hero slot.
                    The charged price is always Printful&apos;s live price. The <strong>anchor</strong> is the cosmetic
                    struck-through &quot;was&quot; price, and it must be higher than the live price to save.
                </p>
            </div>
            <MerchSettingsManager rows={rows} />
        </div>
    );
}
