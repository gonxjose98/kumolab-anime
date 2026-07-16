import AdminShell from '@/components/admin/AdminShell';
import StudioTabs from '@/components/admin/studio/StudioTabs';
import StudioActivityStats from '@/components/admin/studio/StudioActivityStats';
import { requireAccess } from '@/lib/auth/access';

export default async function StudioHubLayout({ children }: { children: React.ReactNode }) {
    const access = await requireAccess('studio');
    return (
        <AdminShell email={access.email} perms={access.perms} isOwner={access.isOwner}>
            <StudioTabs />
            <StudioActivityStats />
            {children}
        </AdminShell>
    );
}
