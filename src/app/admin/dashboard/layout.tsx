import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
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
        return null;
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-black text-slate-900 dark:text-white transition-colors duration-300">
            {/* Simple Admin Header - Not Visible via Main Nav */}


            <header className="border-b border-gray-200 dark:border-neutral-800 p-4 flex justify-between items-center bg-white/70 dark:bg-black/50 backdrop-blur-xl sticky top-0 z-50 transition-colors duration-300">
                <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo.png" alt="" className="h-8 w-auto dark:invert dark:brightness-200 transition-all duration-300" />
                    <span className="font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-500">
                        KumoLab Admin
                    </span>
                </Link>
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
