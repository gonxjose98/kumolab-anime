import AdminShell from '@/components/admin/AdminShell';
import { requireAnyAccess } from '@/lib/auth/access';

// Content and Studio are one tab now, so either permission opens it.
export default async function ContentLayout({ children }: { children: React.ReactNode }) {
    const access = await requireAnyAccess(['content', 'studio']);
    return (
        <AdminShell email={access.email} perms={access.perms} isOwner={access.isOwner}>
            {children}
        </AdminShell>
    );
}
