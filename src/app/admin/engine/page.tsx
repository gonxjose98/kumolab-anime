import { redirect } from 'next/navigation';

// The Engine tab was retired 2026-10-09. System health lives in AI Insights' system drawer;
// the automation, its data and /api/admin/engine/* are untouched.
export default function Page() {
    redirect('/admin/insights');
}
