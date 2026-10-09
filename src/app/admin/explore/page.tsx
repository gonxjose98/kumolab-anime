import { redirect } from 'next/navigation';

// Explore was renamed AI Insights (2026-10-09). Old links and bookmarks land there.
export default function ExploreRedirect() {
    redirect('/admin/insights');
}
