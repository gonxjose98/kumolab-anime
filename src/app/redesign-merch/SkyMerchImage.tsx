'use client';

import { useState } from 'react';
import styles from './SkyMerch.module.css';

interface SkyMerchImageProps {
    /** Preferred (possibly resolution-upgraded) image URL. */
    src: string;
    /** Original Printful thumbnail to retry if the upgraded URL 404s. */
    fallbackSrc: string;
    alt: string;
}

/**
 * Product image with a graceful degradation ladder so the storefront can
 * never render a broken image: upgraded preview URL → original Printful
 * thumbnail → 雲 sky fallback tile (same language as the blog cards).
 */
export default function SkyMerchImage({ src, fallbackSrc, alt }: SkyMerchImageProps) {
    // 0 = upgraded src, 1 = original thumbnail, 2 = 雲 tile
    const [stage, setStage] = useState<0 | 1 | 2>(() => {
        if (src) return 0;
        if (fallbackSrc) return 1;
        return 2;
    });

    if (stage === 2) {
        return (
            <div className={styles.fallback} role="img" aria-label={alt}>
                雲
            </div>
        );
    }

    const current = stage === 0 ? src : fallbackSrc;
    const canRetryOriginal = stage === 0 && !!fallbackSrc && fallbackSrc !== src;

    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={current}
            alt={alt}
            loading="lazy"
            decoding="async"
            className={styles.image}
            onError={() => setStage(canRetryOriginal ? 1 : 2)}
        />
    );
}
