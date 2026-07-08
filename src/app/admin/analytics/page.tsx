import { getAnalyticsData } from '@/lib/analytics/dashboard';
import AnalyticsDashboard from '@/components/admin/analytics/AnalyticsDashboard';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
    const data = await getAnalyticsData();
    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
                <p className="ak-caption">What the cloud has been seeing · Instagram 28-day + live website + per-post performance</p>
            </div>
            <AnalyticsDashboard data={data} />
        </div>
    );
}
