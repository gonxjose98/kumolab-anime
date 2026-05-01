import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AdminHeader from '@/components/admin/AdminHeader';
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
            <AdminHeader userEmail={session.user.email} />
            <main className="p-4 md:p-6 relative z-10">{children}</main>
        </div>
    );
}
