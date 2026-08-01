import { redirect } from 'next/navigation';

/**
 * The blueprint shipped behind this preview route while it was being built.
 * It is now the live Engine tab, so this exists only to keep any link or
 * bookmark from the preview period working. Safe to delete once nothing
 * points here.
 */
export default function EngineBlueprintRedirect() {
    redirect('/admin/engine');
}
