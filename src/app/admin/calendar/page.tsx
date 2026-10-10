import { redirect } from 'next/navigation';

// Calendar lives in the Content side rail.
export default function Page() {
    redirect('/admin/content?view=next');
}
