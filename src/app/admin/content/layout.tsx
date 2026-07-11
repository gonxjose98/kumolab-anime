import AdminShell from '@/components/admin/AdminShell';
import ContentTabs from '@/components/admin/content/ContentTabs';
import { requireAccess } from '@/lib/auth/access';

export default async function ContentLayout({ children }: { children: React.ReactNode }) {
    const access = await requireAccess('content');
    return (
        <AdminShell email={access.email} perms={access.perms} isOwner={access.isOwner}>
            <ContentTabs />
            {children}
        </AdminShell>
    );
}
