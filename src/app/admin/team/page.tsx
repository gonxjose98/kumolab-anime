import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireOwner, normalizePerms, OWNER_EMAIL, type Perms } from '@/lib/auth/access';
import TeamManager, { type Member } from '@/components/admin/team/TeamManager';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
    const access = await requireOwner();

    const { data: rows } = await supabaseAdmin
        .from('admin_users')
        .select('email, permissions, created_at')
        .order('created_at', { ascending: true });

    const members: Member[] = (rows ?? [])
        // Never list the owner as an editable member — the owner is fixed by email.
        .filter((r) => (r.email as string).toLowerCase() !== OWNER_EMAIL)
        .map((r) => ({
            email: r.email as string,
            perms: normalizePerms(r.permissions) as Perms,
        }));

    return (
        <div>
            <div className="ak-card" style={{ marginBottom: '18px', maxWidth: '760px' }}>
                <p className="ak-body-sm" style={{ margin: 0 }}>
                    Create logins for your team and choose what each person can see and do. A new member starts
                    as a <strong>full copy of your admin</strong> (every toggle on); switch off whatever they
                    shouldn&apos;t have. The <strong>Dashboard</strong> is always available. Only you
                    ({access.email}) can manage the team, nobody you add can.
                </p>
            </div>
            <TeamManager members={members} />
        </div>
    );
}
