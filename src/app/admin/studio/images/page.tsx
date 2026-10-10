import { redirect } from 'next/navigation';

// Studio merged into Content > Drafts.
export default function Page() {
    redirect('/admin/content?view=drafts');
}
