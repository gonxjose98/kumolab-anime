import AdminShell from '@/components/admin/AdminShell';
import { requireOwner } from '@/lib/auth/access';

// Team management is owner-exclusive. requireOwner() redirects anyone who is
// not the owner back to the Dashboard, so no sub-user ever reaches this tree.
export default async function TeamLayout({ children }: { children: React.ReactNode }) {
    const access = await requireOwner();
    return <AdminShell email={access.email} perms={access.perms} isOwner={access.isOwner}>{children}</AdminShell>;
}
