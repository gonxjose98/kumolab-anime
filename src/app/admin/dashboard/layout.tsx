import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import LogoutButton from '@/components/admin/LogoutButton';
import GalaxyBackground from '@/components/shared/GalaxyBackground';

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

    if (!session) {
        redirect('/admin/login');
        return null;
    }

    return (
        <div className="admin-galaxy-wrapper min-h-screen text-slate-900 dark:text-white transition-colors duration-300" style={{ background: 'var(--bg-color)' }}>
            <GalaxyBackground />

            <header className="admin-header px-5 py-3 flex justify-between items-center backdrop-blur-2xl sticky top-0 z-50 transition-all duration-300" style={{ background: 'var(--surface-color)', borderBottom: '1px solid var(--border-subtle)' }}>
                <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <div className="relative">
                        <div className="absolute -inset-1 rounded-lg opacity-40 group-hover:opacity-70 transition-opacity" style={{ background: 'linear-gradient(135deg, #00d4ff, #7b61ff, #ff3cac)', filter: 'blur(6px)' }} />
                        <img src="/logo.png" alt="" className="h-7 w-auto relative dark:invert dark:brightness-200 transition-all duration-300" style={{ animation: 'none', opacity: 1 }} />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold tracking-tight" style={{ fontFamily: 'var(--font-display)', background: 'linear-gradient(135deg, #00d4ff, #7b61ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            KUMOLAB
                        </span>
                        <span className="text-[8px] font-bold uppercase tracking-[0.3em]" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}>
                            Admin Console
                        </span>
                    </div>
                </Link>
                <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#00d4ff', animation: 'livePulse 2s ease-in-out infinite' }} />
                        <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>
                            {session.user.email}
                        </span>
                    </div>
                    <LogoutButton />
                </div>
            </header>

            <main className="p-4 md:p-6 relative z-10">
                {children}
            </main>
        </div>
    );
}
