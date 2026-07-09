import { redirect } from 'next/navigation';

// Merch moved under the unified Store tab.
export default function LegacyMerchRedirect() {
    redirect('/admin/store/products');
}
