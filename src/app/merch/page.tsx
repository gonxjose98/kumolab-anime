import type { Metadata } from 'next';

// Live storefront now renders the sky-themed collection. The implementation
// lives in the (non-indexed) preview route; here we render it under the
// canonical /merch URL with production, indexable metadata.
export { default } from '../redesign-merch/page';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
    title: 'The Collection',
    description:
        'Small-batch KumoLab apparel, dropped in limited runs. Wear the sky — cloud goods on a calm cel-shaded storefront.',
    alternates: { canonical: '/merch' },
};
