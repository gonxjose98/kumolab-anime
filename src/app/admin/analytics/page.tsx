import { getAnalyticsData } from '@/lib/analytics/dashboard';
import AnalyticsDashboard from '@/components/admin/analytics/AnalyticsDashboard';

export const dynamic = 'force-dynamic';

const RANGE_MAP: Record<string, number> = { '7': 7, '30': 30, '60': 60, '90': 90, all: 0 };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
    const sp = await searchParams;
    const rangeDays = RANGE_MAP[sp?.range ?? '30'] ?? 30;
    const data = await getAnalyticsData(rangeDays);
    return (
        <div className="max-w-6xl mx-auto">
            <p className="ak-caption" style={{ marginBottom: 14 }}>
                What the cloud has been seeing · filter by platform and time range · per-post detail on click
            </p>
            <AnalyticsDashboard data={data} />
        </div>
    );
}
