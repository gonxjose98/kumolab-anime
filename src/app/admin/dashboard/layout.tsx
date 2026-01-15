import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = createServerComponentClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();

    // Redundant server-side check (Middleware handles this, but good for safety)
    if (!session) {
        redirect('/admin/login');
    }

    return (
        <div className="min-h-screen bg-black text-white">
            {/* Simple Admin Header - Not Visible via Main Nav */}
            <header className="border-b border-neutral-800 p-4 flex justify-between items-center bg-black/50 backdrop-blur sticky top-0 z-50">
                <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-500">
                    KumoLab Admin
                </span>
                <div className="text-xs text-neutral-500 font-mono">
                    {session.user.email}
                </div>
            </header>

            <main className="p-6">
                {children}
            </main>
        </div>
    );
}
