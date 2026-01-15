import Link from 'next/link';
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers';
import { Eye, Calendar, Edit2, TrendingUp } from 'lucide-react';
import AnalyticsDashboard from '@/components/admin/AnalyticsDashboard';

export const dynamic = 'force-dynamic';

// Helper to format dates for chart
function formatDate(dateString: string) {
    const d = new Date(dateString);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

async function getStats(supabase: any) {
    // 1. Fetch raw view timestamps for last 30 days (excluding bots)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: viewsData, error } = await supabase
        .from('page_views')
        .select('timestamp')
        .gt('timestamp', thirtyDaysAgo.toISOString())
        .eq('is_bot', false);

    if (error || !viewsData) return { totalViews: 0, chartData: [] };

    // 2. Process for Chart (Group by Day)
    const dailyCounts: Record<string, number> = {};
    const chartData = [];

    // Initialize last 30 days with 0
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        dailyCounts[key] = 0;
    }

    // Fill counts
    viewsData.forEach((row: any) => {
        const dateKey = new Date(row.timestamp).toISOString().split('T')[0];
        if (dailyCounts[dateKey] !== undefined) {
            dailyCounts[dateKey]++;
        }
    });

    // Convert to array
    for (const [date, count] of Object.entries(dailyCounts)) {
        chartData.push({
            date: formatDate(date),
            views: count,
        });
    }

    return {
        totalViews: viewsData.length,
        chartData
    };
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
        <div className="max-w-7xl mx-auto space-y-8">
            {/* 1. HEADER & OVERVIEW */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Total Views Card */}
                <div className="p-6 rounded-xl bg-neutral-900/50 border border-neutral-800 backdrop-blur-sm relative overflow-hidden">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-neutral-800 rounded-lg text-purple-400">
                            <Eye size={18} />
                        </div>
                        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-widest">Total Views</h3>
                    </div>
                    <div className="text-4xl font-bold text-white mt-2">
                        {stats.totalViews.toLocaleString()}
                    </div>
                    <p className="text-xs text-neutral-500 mt-2 flex items-center gap-1">
                        <Calendar size={12} />
                        Last 30 Days
                    </p>
                </div>

                {/* Analytics Chart */}
                <AnalyticsDashboard initialData={stats.chartData} />
            </div>

            {/* 2. POST MANAGEMENT */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Edit2 size={18} className="text-neutral-500" />
                        Recent Posts
                    </h2>
                </div>

                <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-xl">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-neutral-950/50 text-neutral-400 border-b border-neutral-800">
                            <tr>
                                <th className="p-4 font-medium pl-6">Status</th>
                                <th className="p-4 font-medium">Type</th>
                                <th className="p-4 font-medium w-full">Title</th>
                                <th className="p-4 font-medium text-right">Published</th>
                                <th className="p-4 font-medium text-right pr-6">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800">
                            {posts.map((post: any) => (
                                <tr key={post.id} className="hover:bg-neutral-800/30 transition-colors group">
                                    <td className="p-4 pl-6">
                                        <span className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold tracking-wider border ${post.is_published
                                            ? 'bg-green-950/30 text-green-400 border-green-900/50'
                                            : 'bg-red-950/30 text-red-400 border-red-900/50'
                                            }`}>
                                            {post.is_published ? 'LIVE' : 'HIDDEN'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-neutral-400 font-mono text-xs">{post.type}</td>
                                    <td className="p-4 font-medium text-white group-hover:text-purple-300 transition-colors">
                                        {post.title}
                                    </td>
                                    <td className="p-4 text-neutral-500 text-right whitespace-nowrap font-mono text-xs">
                                        {new Date(post.timestamp).toLocaleDateString()}
                                    </td>
                                    <td className="p-4 text-right pr-6">
                                        <Link
                                            href={`/admin/post/${post.id}`}
                                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white text-black text-xs font-bold rounded hover:bg-neutral-200 transition-colors"
                                        >
                                            <Edit2 size={12} />
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
