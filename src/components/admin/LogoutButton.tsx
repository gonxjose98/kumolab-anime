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
        router.refresh();
    };

    return (
        <button
            onClick={handleLogout}
            className="text-[9px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all hover:scale-105"
            style={{
                background: 'rgba(255,60,60,0.08)',
                border: '1px solid rgba(255,60,60,0.15)',
                color: '#ff4444',
                fontFamily: 'var(--font-display)',
            }}
        >
            Logout
        </button>
    );
}
