import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireOwner } from '@/lib/auth/access';
import { getSystemEmailTemplates } from '@/lib/email/templates';
import EmailManager, { type Subscriber } from '@/components/admin/email/EmailManager';
import type { SentEmail } from '@/components/admin/email/SentHistory';

export const dynamic = 'force-dynamic';

export default async function EmailPage() {
    await requireOwner();

    const [{ data: rows }, { count: total }, { count: subscribed }, systemTemplates, { data: sendRows }] = await Promise.all([
        supabaseAdmin
            .from('email_subscribers')
            .select('id, email, name, status, source, created_at')
            .order('created_at', { ascending: false })
            .limit(500),
        supabaseAdmin.from('email_subscribers').select('id', { count: 'exact', head: true }),
        supabaseAdmin.from('email_subscribers').select('id', { count: 'exact', head: true }).eq('status', 'subscribed'),
        getSystemEmailTemplates(),
        // Sent history: tolerant of the email_sends table not existing yet
        // (supabase-js returns { data: null, error } instead of throwing).
        supabaseAdmin
            .from('email_sends')
            .select('id, kind, subject, recipient_count, sent_at')
            .order('sent_at', { ascending: false })
            .limit(20),
    ]);

    const sends: SentEmail[] = (sendRows ?? []).map((s) => ({
        id: s.id as string,
        kind: (s.kind as string) || 'broadcast',
        subject: (s.subject as string) || '',
        recipientCount: (s.recipient_count as number) ?? 0,
        sentAt: (s.sent_at as string) || '',
    }));

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
            systemTemplates={systemTemplates}
            sends={sends}
        />
    );
}
