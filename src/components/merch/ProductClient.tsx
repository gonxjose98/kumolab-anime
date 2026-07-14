
'use client';

import { useMemo, useState } from 'react';
import { useCartStore } from '@/store/useCartStore';
import styles from './ProductClient.module.css';

interface ProductClientProps {
    productData: any;
    anchorPrice?: number | null;  // cosmetic compare-at; never charged
    label?: string | null;        // e.g. 'Launch price'
}

// Keyword -> hex for common apparel colours. The swatch shows this dot when a
// colour name matches; otherwise it falls back to that colour's garment
// thumbnail, so the swatch is always accurate no matter the naming.
const COLOR_HEX: [string, string][] = [
    ['heather grey', '#b7bcc2'], ['heather gray', '#b7bcc2'], ['charcoal', '#3a3d42'],
    ['dark grey', '#4a4e54'], ['dark gray', '#4a4e54'], ['grey', '#9aa0a6'], ['gray', '#9aa0a6'],
    ['white', '#f7f7f4'], ['ivory', '#f3efe3'], ['bone', '#e6ded0'], ['natural', '#e9e2cf'],
    ['cream', '#f0e9d6'], ['sand', '#d9c9a3'], ['tan', '#c9a97e'], ['khaki', '#b9a06a'],
    ['black', '#17171c'], ['navy', '#20304f'], ['royal', '#2f56a6'], ['sky', '#8fc3ee'], ['blue', '#2f6fd0'],
    ['maroon', '#6e1f2a'], ['red', '#c0392b'], ['pink', '#e79cb3'], ['purple', '#6b4aa0'],
    ['forest', '#26492f'], ['olive', '#6a6a3a'], ['teal', '#2a8c8c'], ['green', '#3d7a4e'],
    ['yellow', '#e8c85a'], ['gold', '#d9a441'], ['orange', '#d97a2b'], ['brown', '#6b4a34'],
];
function colorHex(name: string): string | null {
    const n = name.toLowerCase();
    for (const [k, hex] of COLOR_HEX) if (n.includes(k)) return hex;
    return null;
}

const previewFileOf = (variant: any) => variant?.files?.find((f: any) => f.type === 'preview');
const previewUrlOf = (variant: any) => {
    const f = previewFileOf(variant);
    return f?.preview_url || f?.thumbnail_url;
};

export default function ProductClient({ productData, anchorPrice = null, label = null }: ProductClientProps) {
    const { sync_product, sync_variants } = productData;
    const variants: any[] = sync_variants || [];
    const addItem = useCartStore((state) => state.addItem);

    // Colours in first-seen order (products with no colour skip the swatches).
    const colors = useMemo(() => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const v of variants) {
            const c = (v.color || '').trim();
            if (c && !seen.has(c)) { seen.add(c); out.push(c); }
        }
        return out;
    }, [variants]);
    const hasColors = colors.length > 0;

    const [color, setColor] = useState<string | null>(hasColors ? colors[0] : null);

    // Sizes available for the chosen colour (or all variants if no colour axis).
    const sizesForColor = useMemo(() => {
        const list = hasColors ? variants.filter((v) => (v.color || '').trim() === color) : variants;
        const seen = new Set<string>();
        const out: { size: string; variant: any }[] = [];
        for (const v of list) {
            const s = v.size || 'One size';
            if (!seen.has(s)) { seen.add(s); out.push({ size: s, variant: v }); }
        }
        return out;
    }, [variants, color, hasColors]);

    const [size, setSize] = useState<string>(sizesForColor[0]?.size ?? 'One size');
    const [quantity, setQuantity] = useState(1);

    const selectedVariant = useMemo(() => {
        const match = variants.find(
            (v) => (!hasColors || (v.color || '').trim() === color) && (v.size || 'One size') === size,
        );
        return match || sizesForColor[0]?.variant || variants[0];
    }, [variants, color, size, hasColors, sizesForColor]);

    // Pick the swatch image for each colour (its first variant's mockup).
    const colorThumb = useMemo(() => {
        const map = new Map<string, string | undefined>();
        for (const c of colors) {
            const v = variants.find((x) => (x.color || '').trim() === c);
            const f = previewFileOf(v);
            map.set(c, f?.thumbnail_url || f?.preview_url);
        }
        return map;
    }, [colors, variants]);

    const onSelectColor = (c: string) => {
        setColor(c);
        // Keep the current size if that colour has it, else jump to its first size.
        const stillHas = variants.some((v) => (v.color || '').trim() === c && (v.size || 'One size') === size);
        if (!stillHas) {
            const first = variants.find((v) => (v.color || '').trim() === c);
            setSize(first?.size || 'One size');
        }
    };

    const imageUrl = previewUrlOf(selectedVariant) || sync_product.thumbnail_url;
    const realPrice = parseFloat(selectedVariant?.retail_price || '0');
    const hasAnchor = anchorPrice != null && anchorPrice > realPrice;
    const pct = hasAnchor ? Math.round((1 - realPrice / anchorPrice) * 100) : 0;

    const handleAddToCart = () => {
        addItem({
            variantId: selectedVariant.id,
            productId: sync_product.id,
            name: selectedVariant.name,
            price: parseFloat(selectedVariant.retail_price),
            quantity,
            image: imageUrl,
            size: selectedVariant.size,
            color: selectedVariant.color,
        });
        alert('Added to cart!');
    };

    return (
        <div className={styles.productLayout}>
            <div className={styles.imageSection}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt={sync_product.name} className={styles.mainImage} />
            </div>

            <div className={styles.detailsSection}>
                <h1 className={styles.title}>{sync_product.name}</h1>
                <div className={styles.price} style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                    {hasAnchor && (
                        <span style={{ textDecoration: 'line-through', opacity: 0.5, fontWeight: 400 }}>
                            ${anchorPrice!.toFixed(2)}
                        </span>
                    )}
                    <span>${realPrice.toFixed(2)}</span>
                    {hasAnchor && (
                        <span
                            style={{
                                background: '#e3002b', color: '#fff', fontSize: 13, fontWeight: 800,
                                letterSpacing: '0.04em', padding: '3px 10px', borderRadius: 6,
                            }}
                        >
                            {label ? `${label} · ` : ''}-{pct}%
                        </span>
                    )}
                </div>

                {hasColors && (
                    <div className={styles.optionBlock}>
                        <h3>Color: <span className={styles.optionValue}>{color}</span></h3>
                        <div className={styles.swatches}>
                            {colors.map((c) => {
                                const hex = colorHex(c);
                                const thumb = colorThumb.get(c);
                                const style = hex
                                    ? { background: hex }
                                    : thumb
                                        ? { backgroundImage: `url(${thumb})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                                        : { background: '#c9d2e0' };
                                return (
                                    <button
                                        key={c}
                                        type="button"
                                        title={c}
                                        aria-label={c}
                                        aria-pressed={c === color}
                                        className={`${styles.swatch} ${c === color ? styles.swatchActive : ''}`}
                                        style={style}
                                        onClick={() => onSelectColor(c)}
                                    />
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className={styles.optionBlock}>
                    <h3>Size</h3>
                    <select
                        className={styles.sizeSelect}
                        value={size}
                        onChange={(e) => setSize(e.target.value)}
                    >
                        {sizesForColor.map((s) => (
                            <option key={s.size} value={s.size}>{s.size}</option>
                        ))}
                    </select>
                </div>

                <div className={styles.optionBlock}>
                    <h3>Quantity</h3>
                    <div className={styles.quantityControls}>
                        <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>-</button>
                        <span>{quantity}</span>
                        <button onClick={() => setQuantity(quantity + 1)}>+</button>
                    </div>
                </div>

                <button className={styles.addToCartBtn} onClick={handleAddToCart}>
                    Add to Cart
                </button>
            </div>
        </div>
    );
}
