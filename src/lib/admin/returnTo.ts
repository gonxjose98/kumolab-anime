/**
 * "Where was the operator before they opened a post?"
 *
 * The editor and Studio are reached from several places (Studio → Videos, the
 * dashboard's pending list, Content → Posts, …) so a hardcoded Back destination
 * is wrong most of the time: opening a draft from the Studio tab and pressing
 * Back should return to the Studio tab, not to Content.
 *
 * router.back() cannot do this either. Studio's own Back PUSHES the editor onto
 * the history stack, so popping from the editor lands back in Studio rather
 * than out of it.
 *
 * So the last real destination route is remembered instead. Editor/Studio
 * routes are deliberately never recorded — they are the things you come back
 * FROM, and recording them would make Back a loop.
 */

const KEY = 'kumolab_admin_return_to';

/** Routes that are somewhere to come back to (i.e. not a post workspace). */
export function isReturnable(path: string): boolean {
    if (!path.startsWith('/admin')) return false;
    if (path.startsWith('/admin/post/')) return false;   // editor + studio editor
    if (path.startsWith('/admin/login')) return false;
    return true;
}

export function rememberRoute(path: string): void {
    if (!isReturnable(path)) return;
    try { sessionStorage.setItem(KEY, path); } catch { /* private mode — fall back */ }
}

/** The remembered route, or `fallback` for a direct link / fresh tab. */
export function getReturnTo(fallback = '/admin/content/posts'): string {
    try {
        const v = sessionStorage.getItem(KEY);
        return v && isReturnable(v) ? v : fallback;
    } catch {
        return fallback;
    }
}
