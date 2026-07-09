import { redirect } from 'next/navigation';

// Posts moved under the unified Content tab.
export default function LegacyPostsRedirect() {
    redirect('/admin/content/posts');
}
