
import { Product } from '@/types';
import { supabaseAdmin } from '@/lib/supabase/admin';

const PRINTFUL_API_URL = 'https://api.printful.com';
const ACCESS_TOKEN = process.env.PRINTFUL_ACCESS_TOKEN;

export interface MerchSetting {
    product_id: string;
    is_featured: boolean;
    anchor_price: number | null;
    label: string | null;
    sort_order: number | null;
    show_on_home: boolean;
}

// Pull every KumoLab-side override in one shot, keyed by product_id.
// Reads go through supabaseAdmin (service role) — merch_settings is RLS-locked
// and only ever read/written server-side. Never throws: a settings outage
// degrades to "no overrides" (everything visible, no anchors) rather than an
// empty storefront.
export async function getMerchSettings(): Promise<Map<string, MerchSetting>> {
    const map = new Map<string, MerchSetting>();
    try {
        const { data, error } = await supabaseAdmin
            .from('merch_settings')
            .select('product_id, is_featured, anchor_price, label, sort_order, show_on_home');
        if (error) {
            console.error('getMerchSettings error:', error.message);
            return map;
        }
        for (const row of data || []) {
            map.set(String(row.product_id), {
                product_id: String(row.product_id),
                is_featured: !!row.is_featured,
                anchor_price: row.anchor_price != null ? Number(row.anchor_price) : null,
                label: row.label ?? null,
                sort_order: row.sort_order != null ? Number(row.sort_order) : null,
                show_on_home: !!row.show_on_home,
            });
        }
    } catch (e: any) {
        console.error('getMerchSettings threw:', e?.message || e);
    }
    return map;
}

export async function getProductSetting(productId: string): Promise<MerchSetting | null> {
    const settings = await getMerchSettings();
    return settings.get(String(productId)) || null;
}

export async function getProducts(): Promise<Product[]> {
    if (!ACCESS_TOKEN) {
        console.error('PRINTFUL_ACCESS_TOKEN is not defined');
        return [];
    }

    try {
        const [response, settings] = await Promise.all([
            fetch(`${PRINTFUL_API_URL}/sync/products`, {
                headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` },
                next: { revalidate: 3600 },
            }),
            getMerchSettings(),
        ]);

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
                        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` },
                        next: { revalidate: 3600 },
                    });
                    const detailsData = await detailsResponse.json();
                    const firstVariant = detailsData.result?.sync_variants?.[0];
                    const setting = settings.get(String(p.id));

                    return {
                        id: String(p.id),
                        name: p.name,
                        price: parseFloat(firstVariant?.retail_price || '0'),
                        image: p.thumbnail_url || firstVariant?.files?.find((f: any) => f.type === 'preview')?.thumbnail_url || '',
                        isVisible: true,
                        description: detailsData.result?.sync_product?.name || '',
                        isFeatured: setting?.is_featured ?? false,
                        anchorPrice: setting?.anchor_price ?? null,
                        label: setting?.label ?? null,
                        sortOrder: setting?.sort_order ?? null,
                        showOnHome: setting?.show_on_home ?? false,
                    };
                } catch (err) {
                    console.error(`Error fetching details for product ${p.id}:`, err);
                    return null;
                }
            })
        );

        return products
            .filter((p): p is Product => p !== null && p.isVisible)
            .sort(byPlacement);
    } catch (error) {
        console.error('Error in getProducts:', error);
        return [];
    }
}

// Canonical storefront order: manual sort_order ascending (nulls last), then
// alphabetical as a stable tiebreaker. Used by BOTH the /merch page and the
// home band so the operator's drag-reorder in the admin drives every surface.
function byPlacement(a: Product, b: Product): number {
    const ao = a.sortOrder ?? Number.POSITIVE_INFINITY;
    const bo = b.sortOrder ?? Number.POSITIVE_INFINITY;
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
}

export async function getProduct(id: string) {
    if (!ACCESS_TOKEN) return null;

    try {
        const response = await fetch(`${PRINTFUL_API_URL}/sync/products/${id}`, {
            headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` },
            next: { revalidate: 60 },
        });

        if (!response.ok) return null;

        const data = await response.json();
        return data.result; // Contains sync_product and sync_variants
    } catch (error) {
        console.error(`Error in getProduct(${id}):`, error);
        return null;
    }
}

// /merch tab — the WHOLE catalogue in the operator's manual order
// (getProducts already sorts by sort_order). Nothing is hidden here.
export async function getVisibleProducts(): Promise<Product[]> {
    return await getProducts();
}

// HOME Cloud Collection band. The operator curates placement in the admin:
//   • show_on_home picks exactly which products land on the home band
//   • is_featured (flagship) takes the big hero slot, sorted to the front
//   • sort_order drives the rest of the order
// Fallback: if NOTHING is flagged show_on_home (e.g. before the operator has
// curated), the band shows the full catalogue so the home is never empty. The
// band component caps how many actually render.
export async function getFeaturedProducts(): Promise<Product[]> {
    const all = await getProducts(); // already in sort_order
    const picked = all.filter((p) => p.showOnHome);
    const list = picked.length > 0 ? picked : all;
    // Flagship first, then keep the manual order (getProducts already sorted).
    return [...list].sort((a, b) => Number(!!b.isFeatured) - Number(!!a.isFeatured));
}

// Live Printful retail_price for a single sync variant. This is the SOURCE OF
// TRUTH for what a customer is charged — used by /api/checkout to charge the
// real price server-side instead of trusting the client-sent amount, and by
// the admin save-guard to validate the anchor sits above the real price.
// Returns null if the variant can't be resolved (caller must treat as a hard
// failure — never fall back to a client price).
export async function getSyncVariantPrice(variantId: number | string): Promise<number | null> {
    if (!ACCESS_TOKEN) return null;
    try {
        const res = await fetch(`${PRINTFUL_API_URL}/sync/variant/${variantId}`, {
            headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` },
            cache: 'no-store',
        });
        if (!res.ok) return null;
        const data = await res.json();
        const rp = data.result?.sync_variant?.retail_price ?? data.result?.retail_price;
        const price = parseFloat(rp);
        return Number.isFinite(price) ? price : null;
    } catch (e: any) {
        console.error(`getSyncVariantPrice(${variantId}) threw:`, e?.message || e);
        return null;
    }
}
