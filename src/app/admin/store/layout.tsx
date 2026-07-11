import AdminShell from '@/components/admin/AdminShell';
import StoreTabs from '@/components/admin/store/StoreTabs';
import { requireAccess } from '@/lib/auth/access';

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
    const access = await requireAccess('store');
    return (
        <AdminShell email={access.email} perms={access.perms} isOwner={access.isOwner}>
            <StoreTabs />
            {children}
        </AdminShell>
    );
}
