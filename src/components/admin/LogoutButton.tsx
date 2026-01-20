'use client';

import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation';

export default function LogoutButton() {
    const router = useRouter();
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/admin/login');
        router.refresh(); // Refresh to trigger middleware
    };

    return (
        <button
            onClick={handleLogout}
            className="text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/50 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 shadow-sm"
        >
            Logout
        </button>
    );
}
