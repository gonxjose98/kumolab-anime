import AdminShell from '@/components/admin/AdminShell';
import { requireAnyAccess } from '@/lib/auth/access';

export default async function PostLayout({ children }: { children: React.ReactNode }) {
    // The post editor is reached from Content, Studio, and the pending queue.
    const access = await requireAnyAccess(['content', 'studio', 'pending']);
    return <AdminShell email={access.email} perms={access.perms} isOwner={access.isOwner}>{children}</AdminShell>;
}
