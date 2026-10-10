import { redirect } from 'next/navigation';

// Media folders moved under Content.
export default function Page() {
    redirect('/admin/content/media');
}
