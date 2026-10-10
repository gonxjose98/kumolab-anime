import { redirect } from 'next/navigation';

// The calendar lives in the Content side rail now.
export default function Page() {
    redirect('/admin/content?view=next');
}
