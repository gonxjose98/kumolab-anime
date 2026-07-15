import type { Metadata } from 'next';

// Live feed now renders the sky-themed blog. Implementation lives in the
// (non-indexed) preview route; rendered here under the canonical /blog URL
// with production, indexable metadata.
export { default } from '../redesign-blog/page';

// ISR: cached render, refreshed at most every 5 min (publish revalidates /blog
// on demand so new posts land immediately). Was force-dynamic.
export const revalidate = 300;

export const metadata: Metadata = {
    title: 'The Feed',
    description:
        'Daily anime news, drops, release dates, and trailers — verified and without the noise.',
    alternates: { canonical: '/blog' },
};
