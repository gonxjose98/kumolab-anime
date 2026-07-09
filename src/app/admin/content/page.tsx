import { redirect } from 'next/navigation';

export default function ContentIndex() {
    redirect('/admin/content/posts');
}
