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
            className="text-xs font-medium text-red-500 hover:text-red-400 transition-colors bg-red-950/30 px-3 py-1.5 rounded border border-red-900/50"
        >
            Logout
        </button>
    );
}
