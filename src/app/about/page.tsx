import type { Metadata } from 'next';

// Live about now renders the sky-themed page. Implementation lives in the
// (non-indexed) preview route; rendered here under the canonical /about URL
// with production, indexable metadata.
export { default } from '../redesign-about/page';

export const metadata: Metadata = {
    title: 'About',
    description:
        'KumoLab — anime intelligence and small-batch cloud goods, above the noise.',
    alternates: { canonical: '/about' },
};
