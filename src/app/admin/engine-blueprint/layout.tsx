import AdminShell from '@/components/admin/AdminShell';
import { requireAccess } from '@/lib/auth/access';

/** Same gate as /admin/engine — this preview must not be a way around it. */
export default async function EngineBlueprintLayout({ children }: { children: React.ReactNode }) {
    const access = await requireAccess('content');
    return <AdminShell email={access.email} perms={access.perms} isOwner={access.isOwner}>{children}</AdminShell>;
}
