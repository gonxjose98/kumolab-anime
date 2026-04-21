import { redirect } from 'next/navigation';
import { getPostBySlug, getExpiredRedirect } from '@/lib/blog';
import PostBody from './PostBody';

export const dynamic = 'force-dynamic';

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;

    const post = await getPostBySlug(slug);

    if (!post) {
        // Fork-2 expired post? 301-redirect to the social post so inbound links keep their equity.
        const redirectUrl = await getExpiredRedirect(slug);
        if (redirectUrl) redirect(redirectUrl);
    }

    return <PostBody slug={slug} />;
}
