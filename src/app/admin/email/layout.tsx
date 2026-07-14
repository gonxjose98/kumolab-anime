import AdminShell from '@/components/admin/AdminShell';
import { requireOwner } from '@/lib/auth/access';

// The email list is owner-exclusive, same as Team. requireOwner() redirects
// anyone who is not the owner back to the Dashboard.
export default async function EmailLayout({ children }: { children: React.ReactNode }) {
    const access = await requireOwner();
    return <AdminShell email={access.email} perms={access.perms} isOwner={access.isOwner}>{children}</AdminShell>;
}
