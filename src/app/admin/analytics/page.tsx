import { getAnalyticsData } from '@/lib/analytics/dashboard';
import { getMonthlyReports } from '@/lib/analytics/monthly-report';
import AnalyticsView from '@/components/admin/analytics/AnalyticsView';

export const dynamic = 'force-dynamic';

const RANGE_MAP: Record<string, number> = { '7': 7, '30': 30, '60': 60, '90': 90, all: 0 };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
    const sp = await searchParams;
    const rangeDays = RANGE_MAP[sp?.range ?? '30'] ?? 30;
    const [data, reports] = await Promise.all([getAnalyticsData(rangeDays), getMonthlyReports()]);
    return (
        <div className="max-w-6xl mx-auto">
            <p className="ak-caption" style={{ marginBottom: 14 }}>
                Live realtime dashboard · or per-platform Monthly Reports you can print to PDF
            </p>
            <AnalyticsView live={data} reports={reports} />
        </div>
    );
}
