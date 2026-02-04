import { getPosts } from '@/lib/blog';
import BlogList from '@/components/blog/BlogList';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BlogPage() {
    const posts = await getPosts();

    return (
        <div className="container" style={{ paddingTop: 'calc(var(--header-height) + 2rem)', paddingBottom: '4rem' }}>
            <header style={{ marginBottom: '3rem' }}>
                <h1 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '1rem' }}>The Feed</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', maxWidth: '600px' }}>
                    Real-time anime intelligence. No fluff. No clickbait.
                </p>
            </header>
            <BlogList initialPosts={posts} />
        </div>
    );
}
