import type { Metadata } from 'next';

// Live privacy page now renders the sky-themed version. Implementation lives
// in the (non-indexed) preview route; rendered here under the canonical
// /privacy URL with production, indexable metadata.
export { default } from '../redesign-legal/privacy/page';

export const metadata: Metadata = {
    title: 'Privacy Policy · KumoLab',
    description: "KumoLab's Privacy Policy.",
    alternates: { canonical: '/privacy' },
};
