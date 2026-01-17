import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers';
import { Eye, Calendar } from 'lucide-react';
import AnalyticsDashboard from '@/components/admin/AnalyticsDashboard';
import PostManager from '@/components/admin/PostManager';

export const dynamic = 'force-dynamic';

function formatDate(dateString: string) {
    const d = new Date(dateString);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

async function getStats(supabase: any) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: viewsData, error } = await supabase
        .from('page_views')
        .select('timestamp')
        .gt('timestamp', thirtyDaysAgo.toISOString())
        .eq('is_bot', false);

    if (error || !viewsData) return { totalViews: 0, chartData: [] };

    const dailyCounts: Record<string, number> = {};
    const chartData = [];

    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        dailyCounts[key] = 0;
    }

    viewsData.forEach((row: any) => {
        const dateKey = new Date(row.timestamp).toISOString().split('T')[0];
        if (dailyCounts[dateKey] !== undefined) {
            dailyCounts[dateKey]++;
        }
    });

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
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100);
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

                <AnalyticsDashboard initialData={stats.chartData} />
            </div>

            {/* 2. POST MANAGEMENT (Client Component) */}
            <PostManager initialPosts={posts} />
        </div>
    );
}
