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
                <div className="p-6 rounded-2xl bg-black/20 border border-white/5 backdrop-blur-xl relative overflow-hidden group hover:border-white/10 transition-colors">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="flex items-center gap-3 mb-4 relative z-10">
                        <div className="p-2.5 bg-white/5 rounded-xl text-purple-400 border border-white/5 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                            <Eye size={20} />
                        </div>
                        <h3 className="text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em]">Total Traffic</h3>
                    </div>
                    <div className="text-5xl font-black text-white tracking-tighter relative z-10 drop-shadow-sm">
                        {stats.totalViews.toLocaleString()}
                    </div>
                    <p className="text-[10px] uppercase tracking-widest text-neutral-600 mt-4 flex items-center gap-2 font-mono relative z-10">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        Live Signal • Last 30 Days
                    </p>
                </div>

                <AnalyticsDashboard initialData={stats.chartData} />
            </div>

            {/* 2. POST MANAGEMENT (Client Component) */}
            <PostManager initialPosts={posts} />
        </div>
    );
}
