import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers';
import { Eye, Calendar } from 'lucide-react';
import AnalyticsDashboard from '@/components/admin/AnalyticsDashboard';
import PostManager from '@/components/admin/PostManager';
import { fromDbPosts } from '@/lib/posts/normalize';

export const dynamic = 'force-dynamic';

function formatDate(dateString: string) {
    const d = new Date(dateString);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

async function getAnalytics(supabase: any) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Website Views (Time Series)
    // We fetch just timestamps for the chart (limit 1000 is acceptable for trend, or we'd need RPC)
    // BUT for the Total Count, we use a separate count queries to break limits.
    const { count: totalWebsiteViews } = await supabase
        .from('page_views')
        .select('*', { count: 'exact', head: true })
        .eq('is_bot', false);

    // 2. Chart Data (30 Parallel COUNT queries to scale infinitely)
    // We avoid fetching rows to prevent 1000/2000 limit cap.
    const dates = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d);
    }

    const dailyCounts = await Promise.all(dates.map(async (date) => {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);

        // Supabase COUNT is fast and unlimited
        const { count } = await supabase
            .from('page_views')
            .select('*', { count: 'exact', head: true })
            .gte('timestamp', start.toISOString())
            .lte('timestamp', end.toISOString())
            .eq('is_bot', false);

        return {
            date: formatDate(date.toISOString()),
            views: count || 0
        };
    }));

    const chartData = dailyCounts;

    // 2. Social Metrics (Aggregated from Posts)
    // Fetch social_metrics if available.
    let socialStats = {
        views: 0,
        likes: 0,
        comments: 0,
        breakdown: {
            twitter: { views: 0, likes: 0, comments: 0 },
            instagram: { views: 0, likes: 0, comments: 0 },
            facebook: { views: 0, likes: 0, comments: 0 }
        }
    };

    try {
        const { data: postsData } = await supabase.from('posts').select('social_metrics');

        if (postsData) {
            postsData.forEach((p: any) => {
                const m = p.social_metrics;
                if (m) {
                    // Twitter
                    if (m.twitter) {
                        const v = m.twitter.views || 0;
                        const l = m.twitter.likes || 0;
                        const c = m.twitter.comments || 0;
                        socialStats.views += v;
                        socialStats.likes += l;
                        socialStats.comments += c;
                        socialStats.breakdown.twitter.views += v;
                        socialStats.breakdown.twitter.likes += l;
                        socialStats.breakdown.twitter.comments += c;
                    }
                    // Instagram
                    if (m.instagram) {
                        const v = m.instagram.views || 0;
                        const l = m.instagram.likes || 0;
                        const c = m.instagram.comments || 0;
                        socialStats.views += v;
                        socialStats.likes += l;
                        socialStats.comments += c;
                        socialStats.breakdown.instagram.views += v;
                        socialStats.breakdown.instagram.likes += l;
                        socialStats.breakdown.instagram.comments += c;
                    }
                    // Facebook
                    if (m.facebook) {
                        const v = m.facebook.views || 0;
                        const l = m.facebook.likes || 0;
                        const c = m.facebook.comments || 0;
                        socialStats.views += v;
                        socialStats.likes += l;
                        socialStats.comments += c;
                        socialStats.breakdown.facebook.views += v;
                        socialStats.breakdown.facebook.likes += l;
                        socialStats.breakdown.facebook.comments += c;
                    }
                }
            });
        }
    } catch (e) {
        console.warn("Could not fetch social metrics from DB", e);
    }

    return {
        website: {
            views: totalWebsiteViews || 0,
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

    return fromDbPosts(posts);
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
