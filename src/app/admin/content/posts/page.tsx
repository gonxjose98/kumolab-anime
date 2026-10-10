import { redirect } from 'next/navigation';

// Merged into the single Content page.
export default function Page() {
    redirect('/admin/content?view=posted');
}
