import { getScheduleRows } from '@/lib/schedule';
import ScheduleView from '@/components/admin/content/ScheduleView';

export const dynamic = 'force-dynamic';

export default async function ContentSchedulePage() {
    // 21 days ahead: carousels are planned 2-3 weeks out, one per day.
    const rows = await getScheduleRows({ pastHours: 24, futureHours: 504 });
    return (
        <div className="max-w-5xl mx-auto">
            <ScheduleView rows={rows} />
        </div>
    );
}
