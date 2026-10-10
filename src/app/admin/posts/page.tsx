import { redirect } from 'next/navigation';

// Posts moved under Content.
export default function Page() {
    redirect('/admin/content');
}
