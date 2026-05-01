import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import LogoutButton from '@/components/admin/LogoutButton';
import GalaxyBackground from '@/components/shared/GalaxyBackground';

export default async function AdminPostLayout({ children }: { children: React.ReactNode }) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { cookies: { get(name: string) { return cookieStore.get(name)?.value; } } },
    );

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) redirect('/admin/login');

    return (
        <div className="admin-galaxy-wrapper min-h-screen text-white" style={{ background: 'var(--bg-color)' }}>
            <GalaxyBackground />

            <header
                className="admin-header px-5 py-3 flex justify-between items-center backdrop-blur-2xl sticky top-0 z-50"
                style={{ background: 'var(--surface-color)', borderBottom: '1px solid var(--border-subtle)' }}
            >
                <Link href="/admin/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity group">
                    <div className="relative">
                        <div
                            className="absolute -inset-1 rounded-lg opacity-40 group-hover:opacity-70 transition-opacity"
                            style={{ background: 'linear-gradient(135deg, #00d4ff, #7b61ff, #ff3cac)', filter: 'blur(6px)' }}
                        />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo.png" alt="" className="h-7 w-auto relative dark:invert dark:brightness-200" />
                    </div>
                    <div className="flex flex-col leading-tight">
                        <span
                            className="text-sm font-bold tracking-tight"
                            style={{
                                fontFamily: 'var(--font-display)',
                                background: 'linear-gradient(135deg, #00d4ff, #7b61ff)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                            }}
                        >
                            KUMOLAB
                        </span>
                        <span
                            className="text-[8px] font-bold uppercase tracking-[0.3em]"
                            style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-display)' }}
                        >
                            Console · Editor
                        </span>
                    </div>
                </Link>

                <div className="flex items-center gap-3">
                    <Link
                        href="/admin/dashboard"
                        className="text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1.5 rounded-lg transition-colors hover:bg-white/[0.05]"
                        style={{
                            color: 'var(--text-tertiary)',
                            fontFamily: 'var(--font-display)',
                            border: '1px solid rgba(255,255,255,0.06)',
                        }}
                    >
                        ← Console
                    </Link>
                    <LogoutButton />
                </div>
            </header>

            <main className="p-4 md:p-6 relative z-10">{children}</main>
        </div>
    );
}
