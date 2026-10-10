import { redirect } from 'next/navigation';

// The Library is Content search now.
export default function Page() {
    redirect('/admin/content?view=posted');
}
