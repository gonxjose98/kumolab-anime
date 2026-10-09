'use client';

import { useRouter } from 'next/navigation';
import p from './Pages.module.css';

/**
 * "Back" for inner pages: fades the page out (same transition as links), then
 * goes back if the visitor came from another page here, otherwise to the homepage.
 */
export default function BackButton() {
    const router = useRouter();
    const goBack = () => {
        // Pages seen in this tab (counted by Reveal); >1 means we came from inside the site.
        const fromHere = (() => {
            try { return Number(sessionStorage.getItem('hv3-pages') || 0) > 1; } catch { return false; }
        })();
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const go = () => (fromHere ? router.back() : router.push('/'));
        if (reduce) return go();
        document.documentElement.classList.add('hv3-leaving');
        window.setTimeout(go, 280);
    };
    return (
        <button type="button" className={p.back} onClick={goBack}>
            <span aria-hidden="true">←</span> Back
        </button>
    );
}
