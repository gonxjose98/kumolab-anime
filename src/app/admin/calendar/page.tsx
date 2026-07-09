import { redirect } from 'next/navigation';

// Calendar moved under the unified Content tab.
export default function LegacyCalendarRedirect() {
    redirect('/admin/content/calendar');
}
