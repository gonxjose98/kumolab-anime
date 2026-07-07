/**
 * Content-page sky theme — reusable foundation.
 *
 * Usage (any content page: blog, merch, about, legal):
 *
 *   import SkyContentRoot from '@/components/sky-content';
 *
 *   export default function Page() {
 *       return (
 *           <SkyContentRoot>
 *               ...page content (inherits the --sky-* palette tokens)...
 *           </SkyContentRoot>
 *       );
 *   }
 *
 * SkyContentRoot provides: the opaque calm-sky backdrop (bright day /
 * navy starfield night, cross-faded by the shared ☀/🌙 toggle), gently
 * drifting cel clouds, the route-scoped nav re-skin, and normal document
 * scrolling — all route-scoped and fully reverted on unmount.
 */
export { default } from './SkyContentRoot';
export { default as SkyContentRoot } from './SkyContentRoot';
export { default as SkyContentBackdrop } from './SkyContentBackdrop';
export { default as ScrollUnlock } from './ScrollUnlock';
export { CelCloud, CelCloudWide, Moon } from './art';
