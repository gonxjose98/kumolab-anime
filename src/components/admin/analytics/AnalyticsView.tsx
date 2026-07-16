'use client';

import { useState } from 'react';
import AnalyticsDashboard from './AnalyticsDashboard';
import MonthlyReports from './MonthlyReports';
import type { AnalyticsData } from '@/lib/analytics/dashboard';
import type { MonthlyReportRow } from '@/lib/analytics/monthly-report';

/**
 * Top-level Analytics switch: the live realtime dashboard (what the cloud is
 * seeing right now, range-filterable) vs the Monthly Reports (captured
 * month-end snapshots, one card per platform, print-to-PDF). Kept as one tab
 * with an in-page toggle rather than two routes.
 */
export default function AnalyticsView({ live, reports }: { live: AnalyticsData; reports: MonthlyReportRow[] }) {
    const [view, setView] = useState<'live' | 'monthly'>('live');
    return (
        <div className="flex flex-col gap-4">
            <div className="ak-pills ak-no-print" style={{ alignSelf: 'flex-start' }}>
                <button className={`ak-pill ${view === 'live' ? 'ak-pill--active' : ''}`} onClick={() => setView('live')}>
                    Live · realtime
                </button>
                <button className={`ak-pill ${view === 'monthly' ? 'ak-pill--active' : ''}`} onClick={() => setView('monthly')}>
                    Monthly reports
                </button>
            </div>
            {view === 'live' ? <AnalyticsDashboard data={live} /> : <MonthlyReports reports={reports} />}
        </div>
    );
}
