import { redirect } from 'next/navigation';
import { getPostBySlug, getExpiredRedirect } from '@/lib/blog';
import PostBody from './PostBody';
import SkyContentRoot from '@/components/sky-content';
import SkyFooter from '@/components/redesign-sky/SkyFooter';

export const dynamic = 'force-dynamic';

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;

    const post = await getPostBySlug(slug);

    if (!post) {
        // Fork-2 expired post? 301-redirect to the social post so inbound links keep their equity.
        const redirectUrl = await getExpiredRedirect(slug);
        if (redirectUrl) redirect(redirectUrl);
    }

    return (
        <SkyContentRoot>
            <PostBody slug={slug} />
            <SkyFooter />
        </SkyContentRoot>
    );
}
