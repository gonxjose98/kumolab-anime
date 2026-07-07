import type { Metadata } from 'next';

// Live terms page now renders the sky-themed version. Implementation lives
// in the (non-indexed) preview route; rendered here under the canonical
// /terms URL with production, indexable metadata.
export { default } from '../redesign-legal/terms/page';

export const metadata: Metadata = {
    title: 'Terms of Service · KumoLab',
    description: "KumoLab's Terms of Service.",
    alternates: { canonical: '/terms' },
};
