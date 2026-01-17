import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import LogoutButton from '@/components/admin/LogoutButton';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return cookieStore.get(name)?.value
                },
            },
        }
    );

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
                <div className="flex items-center gap-4">
                    <div className="text-xs text-neutral-500 font-mono">
                        {session.user.email}
                    </div>
                    <LogoutButton />
                </div>
            </header>

            <main className="p-6">
                {children}
            </main>
        </div>
    );
}
