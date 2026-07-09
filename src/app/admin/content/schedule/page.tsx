import { getScheduleRows } from '@/lib/schedule';
import ScheduleView from '@/components/admin/content/ScheduleView';

export const dynamic = 'force-dynamic';

export default async function ContentSchedulePage() {
    const rows = await getScheduleRows({ pastHours: 24, futureHours: 48 });
    return (
        <div className="max-w-5xl mx-auto">
            <p className="ak-caption" style={{ marginBottom: 14 }}>
                What&apos;s slotted around now, and which pieces got the peak-hour windows.
            </p>
            <ScheduleView rows={rows} />
        </div>
    );
}
