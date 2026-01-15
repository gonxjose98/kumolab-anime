import Link from 'next/link';
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

async function getStats(supabase: any) {
    // 1. Total Site Views (Last 30 Days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count: totalViews } = await supabase
        .from('page_views')
        .select('*', { count: 'exact', head: true })
        .gt('timestamp', thirtyDaysAgo.toISOString())
        .eq('is_bot', false); // Exclude bots

    return { totalViews: totalViews || 0 };
}

async function getPosts(supabase: any) {
    const { data: posts } = await supabase
        .from('posts')
        .select('id, title, type, is_published, timestamp, slug')
        .order('timestamp', { ascending: false })
        .limit(50);
    return posts || [];
}

export default async function DashboardPage() {
    const cookieStore = await cookies();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value
                },
            },
        }
    );

    const stats = await getStats(supabase);
    const posts = await getPosts(supabase);

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            {/* 1. ANALYTICS CARD */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-6 rounded-lg bg-neutral-900 border border-neutral-800">
                    <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-2">Total Site Views</h3>
                    <div className="text-4xl font-bold text-white">
                        {stats.totalViews.toLocaleString()}
                    </div>
                    <p className="text-xs text-neutral-500 mt-2">Last 30 Days (Excluding Bots)</p>
                </div>
                {/* Future: Add more stats here */}
            </div>

            {/* 2. POST MANAGEMENT */}
            <div className="space-y-4">
                <h2 className="text-xl font-bold text-white">Recent Posts</h2>
                <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-neutral-950 text-neutral-400 border-b border-neutral-800">
                            <tr>
                                <th className="p-4 font-medium">Status</th>
                                <th className="p-4 font-medium">Type</th>
                                <th className="p-4 font-medium w-full">Title</th>
                                <th className="p-4 font-medium text-right">Date</th>
                                <th className="p-4 font-medium text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800">
                            {posts.map((post: any) => (
                                <tr key={post.id} className="hover:bg-neutral-800/50 transition-colors">
                                    <td className="p-4">
                                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${post.is_published
                                            ? 'bg-green-900/30 text-green-400 border border-green-900'
                                            : 'bg-red-900/30 text-red-400 border border-red-900'
                                            }`}>
                                            {post.is_published ? 'LIVE' : 'HIDDEN'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-neutral-400 font-mono text-xs">{post.type}</td>
                                    <td className="p-4 font-medium text-white">{post.title}</td>
                                    <td className="p-4 text-neutral-500 text-right whitespace-nowrap">
                                        {new Date(post.timestamp).toLocaleDateString()}
                                    </td>
                                    <td className="p-4 text-right">
                                        {/* Placeholder for Editor Link */}
                                        <Link href={`/admin/post/${post.id}`} className="text-purple-400 hover:text-purple-300 font-medium">
                                            Edit
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
