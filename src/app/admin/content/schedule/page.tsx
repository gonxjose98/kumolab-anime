import { redirect } from 'next/navigation';

// Merged into Content > Up next.
export default function Page() {
    redirect('/admin/content?view=next');
}
