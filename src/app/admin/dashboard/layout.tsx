import AdminShell from '@/components/admin/AdminShell';
import { requireSignedIn } from '@/lib/auth/access';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    // Dashboard is the landing for everyone; its cards respect permissions.
    const access = await requireSignedIn();
    return <AdminShell email={access.email} perms={access.perms} isOwner={access.isOwner}>{children}</AdminShell>;
}
