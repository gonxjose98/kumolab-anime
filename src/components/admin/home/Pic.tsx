'use client';

import { useState } from 'react';
import { initialsOf, tileColor } from '@/components/admin/discover/format';

/**
 * Picture with a fallback chain: tries each URL in order, then a colored
 * initials tile. The wrapper sets the size; the image covers it.
 */
export default function Pic({ srcs, label, className = '', tileText }: { srcs: string[]; label: string; className?: string; tileText?: string }) {
    const [idx, setIdx] = useState(0);
    const src = srcs[idx];
    if (!src) {
        return (
            <span className={`ak-home-pic ak-home-pic--tile ${className}`} style={{ background: tileColor(label) }} aria-hidden="true">
                {tileText ?? initialsOf(label)}
            </span>
        );
    }
    return (
        <span className={`ak-home-pic ${className}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setIdx((i) => i + 1)} />
        </span>
    );
}
