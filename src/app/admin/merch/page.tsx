import { getProducts } from '@/lib/merch';
import MerchSettingsManager, { type MerchRow } from '@/components/admin/merch/MerchSettingsManager';

export const dynamic = 'force-dynamic';

export default async function AdminMerchPage() {
    // getProducts() already merges live Printful price + current merch_settings.
    const products = await getProducts();

    const rows: MerchRow[] = products.map((p) => ({
        product_id: p.id,
        name: p.name,
        image: p.image,
        livePrice: p.price,
        isFeatured: !!p.isFeatured,
        anchorPrice: p.anchorPrice ?? null,
        label: p.label ?? null,
    }));

    return (
        <div className="max-w-4xl mx-auto">
            <header className="mb-6">
                <h1 className="text-2xl font-black tracking-tight">Merch</h1>
                <p className="text-sm opacity-70">
                    Only <strong>featured</strong> products show on the storefront. The charged price is always
                    Printful&apos;s live price — you set the cosmetic <strong>anchor</strong> (the struck-through
                    &quot;was&quot; price). Save is blocked unless the anchor is higher than Printful&apos;s price.
                </p>
            </header>
            <MerchSettingsManager rows={rows} />
        </div>
    );
}
