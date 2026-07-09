import { redirect } from 'next/navigation';

// Orders moved under the unified Store tab.
export default function LegacyOrdersRedirect() {
    redirect('/admin/store/orders');
}
