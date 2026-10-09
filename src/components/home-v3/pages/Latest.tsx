import { getPosts } from '@/lib/blog';
import { BlogPost } from '@/types';
import PageShell from '../PageShell';
import LatestFeed from '../LatestFeed';
import p from '../Pages.module.css';

export default async function LatestPage() {
    let posts: BlogPost[] = [];
    try { posts = await getPosts(); } catch (e) { console.error('[latest] posts', e); }
    return (
        <PageShell title="Latest" sub="Every anime announcement we've checked, newest first." active="/blog">
            <div className={p.wrap}><LatestFeed posts={posts} /></div>
        </PageShell>
    );
}
