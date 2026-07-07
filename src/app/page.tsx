// Live home now renders the sea-to-sky experience. Implementation lives in
// the (non-indexed) preview route; rendered here under the canonical "/"
// URL, inheriting the site's production home metadata from the layout.
export { default } from './redesign-sky/page';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
