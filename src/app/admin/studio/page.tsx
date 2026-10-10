import { redirect } from 'next/navigation';

// Studio merged into Content: drafts live under Drafts, every post has a Studio button.
export default function Page() {
    redirect('/admin/content?view=drafts');
}
