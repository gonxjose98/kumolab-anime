'use client';

import { useState } from 'react';
import AnalyticsDashboard from './AnalyticsDashboard';
import MonthlyReports from './MonthlyReports';
import SponsorGenerator from './SponsorGenerator';
import type { AnalyticsData } from '@/lib/analytics/dashboard';
import type { MonthlyReportRow } from '@/lib/analytics/monthly-report';

/**
 * Top-level Analytics switch: the live realtime dashboard (what the cloud is
 * seeing right now, range-filterable), the Monthly Reports (captured month-end
 * snapshots, one card per platform), and the Sponsor Kit (branded one-pager
 * built from a month, print-to-PDF). One tab, in-page toggle — not three routes.
 */
type View = 'live' | 'monthly' | 'sponsor';

const TABS: { key: View; label: string }[] = [
    { key: 'live', label: 'Live · realtime' },
    { key: 'monthly', label: 'Monthly reports' },
    { key: 'sponsor', label: 'Sponsor kit' },
];

export default function AnalyticsView({ live, reports }: { live: AnalyticsData; reports: MonthlyReportRow[] }) {
    const [view, setView] = useState<View>('live');
    return (
        <div className="flex flex-col gap-4">
            <div className="ak-pills ak-no-print" style={{ alignSelf: 'flex-start' }}>
                {TABS.map((t) => (
                    <button key={t.key} className={`ak-pill ${view === t.key ? 'ak-pill--active' : ''}`} onClick={() => setView(t.key)}>
                        {t.label}
                    </button>
                ))}
            </div>
            {view === 'live' && <AnalyticsDashboard data={live} />}
            {view === 'monthly' && <MonthlyReports reports={reports} />}
            {view === 'sponsor' && <SponsorGenerator reports={reports} />}
        </div>
    );
}
