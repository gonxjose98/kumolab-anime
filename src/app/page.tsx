// Live home now renders the sea-to-sky experience. Implementation lives in
// the (non-indexed) preview route; rendered here under the canonical "/"
// URL, inheriting the site's production home metadata from the layout.
export { default } from './redesign-sky/page';

// ISR: serve a cached render, refresh at most every 5 min. Publishing calls
// revalidatePath('/'), so newly-published posts appear immediately rather than
// waiting for the 300s tick. Was force-dynamic (a fresh DB read per view).
export const revalidate = 300;
