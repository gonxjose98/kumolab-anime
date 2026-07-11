import AdminShell from '@/components/admin/AdminShell';
import { requireAnyAccess } from '@/lib/auth/access';

export default async function PostsLayout({ children }: { children: React.ReactNode }) {
    const access = await requireAnyAccess(['content', 'studio', 'pending']);
    return <AdminShell email={access.email} perms={access.perms} isOwner={access.isOwner}>{children}</AdminShell>;
}
