import AdminShell from '@/components/admin/AdminShell';
import { requireAccess } from '@/lib/auth/access';

export default async function EngineLayout({ children }: { children: React.ReactNode }) {
    const access = await requireAccess('content');
    return <AdminShell email={access.email} perms={access.perms} isOwner={access.isOwner}>{children}</AdminShell>;
}
