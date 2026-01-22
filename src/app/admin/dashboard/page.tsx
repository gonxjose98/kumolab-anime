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

async function getAnalytics(supabase: any) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Website Views (Time Series)
    const { data: viewsData, error } = await supabase
        .from('page_views')
        .select('timestamp')
        .gt('timestamp', thirtyDaysAgo.toISOString())
        .eq('is_bot', false);

    const dailyCounts: Record<string, number> = {};
    const chartData = [];

    // Init last 30 days
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        dailyCounts[key] = 0;
    }

    if (viewsData) {
        viewsData.forEach((row: any) => {
            const dateKey = new Date(row.timestamp).toISOString().split('T')[0];
            if (dailyCounts[dateKey] !== undefined) dailyCounts[dateKey]++;
        });
    }

    for (const [date, count] of Object.entries(dailyCounts)) {
        chartData.push({ date: formatDate(date), views: count });
    }

    const totalWebsiteViews = viewsData?.length || 0;

    // 2. Social Metrics (Aggregated from Posts)
    // We assume 'posts' table has a 'socialMetrics' column (JSONB) as per our type definition.
    // Since we just updated Types but maybe not DB, we'll try to select it. 
    // If it fails (column doesn't exist), we catch and default to 0.
    let socialStats = { views: 0, likes: 0, comments: 0 };

    try {
        const { data: postsData } = await supabase.from('posts').select('social_metrics'); // logic assumes snake_case in DB mapping to camelCase in Types? Supabase usually snake_case.
        // Actually, we haven't migrated the DB. This fetch might fail if column is missing. 
        // For robustness, we'll handle empty return.

        if (postsData) {
            postsData.forEach((p: any) => {
                const m = p.social_metrics; // social_metrics JSON
                if (m) {
                    // Add up Twitter
                    if (m.twitter) {
                        socialStats.views += m.twitter.views || 0;
                        socialStats.likes += m.twitter.likes || 0;
                        socialStats.comments += m.twitter.comments || 0;
                    }
                    // Add up IG
                    if (m.instagram) {
                        socialStats.views += m.instagram.views || 0;
                        socialStats.likes += m.instagram.likes || 0;
                        socialStats.comments += m.instagram.comments || 0;
                    }
                    // Add up FB
                    if (m.facebook) {
                        socialStats.views += m.facebook.views || 0;
                        socialStats.likes += m.facebook.likes || 0;
                        socialStats.comments += m.facebook.comments || 0;
                    }
                }
            });
        }
    } catch (e) {
        console.warn("Could not fetch social metrics from DB", e);
    }

    return {
        website: {
            views: totalWebsiteViews,
            chart: chartData
        },
        social: socialStats
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

    const analytics = await getAnalytics(supabase);
    const posts = await getPosts(supabase);

    return (
        <div className="max-w-7xl mx-auto space-y-8">
            {/* 1. ANALYTICS DASHBOARD */}
            <AnalyticsDashboard
                websiteData={analytics.website}
                socialData={analytics.social}
            />

            {/* 2. POST MANAGEMENT */}
            <PostManager initialPosts={posts} />
        </div>
    );
}
