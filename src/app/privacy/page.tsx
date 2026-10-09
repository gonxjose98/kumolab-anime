import type { Metadata } from 'next';

// Live privacy page now renders the sky-themed version. Implementation lives
// in the (non-indexed) preview route; rendered here under the canonical
// /privacy URL with production, indexable metadata.
export { default } from '@/components/home-v3/pages/Privacy';

export const metadata: Metadata = {
    title: 'Privacy Policy · KumoLab',
    description: "KumoLab's Privacy Policy.",
    alternates: { canonical: '/privacy' },
};
