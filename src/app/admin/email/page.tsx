import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/auth/access';
import EmailManager, { type Subscriber } from '@/components/admin/email/EmailManager';

export const dynamic = 'force-dynamic';

export default async function EmailPage() {
    await requireOwner();

    const [{ data: rows }, { count: total }, { count: subscribed }] = await Promise.all([
        supabaseAdmin
            .from('email_subscribers')
            .select('id, email, name, status, source, created_at')
            .order('created_at', { ascending: false })
            .limit(500),
        supabaseAdmin.from('email_subscribers').select('id', { count: 'exact', head: true }),
        supabaseAdmin.from('email_subscribers').select('id', { count: 'exact', head: true }).eq('status', 'subscribed'),
    ]);

    const subscribers: Subscriber[] = (rows ?? []).map((r) => ({
        id: r.id as string,
        email: r.email as string,
        name: (r.name as string) || '',
        status: (r.status as string) || 'subscribed',
        source: (r.source as string) || '',
        createdAt: (r.created_at as string) || '',
    }));

    return (
        <EmailManager
            subscribers={subscribers}
            total={total ?? 0}
            subscribed={subscribed ?? 0}
            resendConnected={!!process.env.RESEND_API_KEY}
        />
    );
}
