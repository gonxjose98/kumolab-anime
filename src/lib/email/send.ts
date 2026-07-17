import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Self-owned email list: broadcast sending via Resend.
 *
 * Every message carries a personalized unsubscribe link (footer + the
 * List-Unsubscribe header), so we use Resend's batch API (up to 100
 * messages per call) instead of one email with many recipients.
 */

const FROM = process.env.EMAIL_FROM || 'KumoLab <news@kumolabanime.com>';
const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://kumolabanime.com';
const BATCH_SIZE = 100;

interface Recipient {
    email: string;
    unsubscribe_token: string;
}

export interface BroadcastResult {
    sent: number;
    failed: number;
}

/** Load every subscribed recipient, paging past Supabase's 1000-row cap. */
async function loadSubscribed(): Promise<Recipient[]> {
    const out: Recipient[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabaseAdmin
            .from('email_subscribers')
            .select('email, unsubscribe_token')
            .eq('status', 'subscribed')
            .order('created_at', { ascending: true })
            .range(from, from + PAGE - 1);
        if (error) throw new Error(`Could not load subscribers: ${error.message}`);
        out.push(...((data ?? []) as Recipient[]));
        if (!data || data.length < PAGE) break;
    }
    return out;
}

/**
 * Send a broadcast to every subscribed member of the list.
 * Throws if RESEND_API_KEY is missing or the list can't be loaded;
 * individual recipient failures do not abort the run.
 *
 * Every completed run is recorded (best-effort) in email_sends so the admin
 * Email tab can show a compact sent history. `kind` labels the row
 * ('broadcast' for admin sends, 'forecast' for the weekly newsletter).
 */
export async function sendBroadcast({
    subject,
    html,
    text,
    kind = 'broadcast',
    sentBy = null,
}: {
    subject: string;
    html: string;
    text?: string;
    kind?: 'broadcast' | 'forecast' | 'system';
    sentBy?: string | null;
}): Promise<BroadcastResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        throw new Error('RESEND_API_KEY is not set. Connect Resend (add the key in Vercel env) before sending.');
    }
    const resend = new Resend(apiKey);

    const recipients = await loadSubscribed();
    if (recipients.length === 0) return { sent: 0, failed: 0 };

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
        const chunk = recipients.slice(i, i + BATCH_SIZE);
        const messages = chunk.map((r) => {
            const unsubUrl = `${BASE}/api/email/unsubscribe?token=${r.unsubscribe_token}`;
            return {
                from: FROM,
                to: r.email,
                subject,
                html:
                    `${html}` +
                    `<p style="margin-top:28px;font-size:12px;color:#8a8f98;">` +
                    `You're receiving this because you joined the KumoLab list. ` +
                    `<a href="${unsubUrl}" style="color:#8a8f98;">Unsubscribe</a></p>`,
                text: `${text || ''}\n\nUnsubscribe: ${unsubUrl}`,
                headers: {
                    'List-Unsubscribe': `<${unsubUrl}>`,
                    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                },
            };
        });

        try {
            const { error } = await resend.batch.send(messages);
            if (error) {
                console.error('Resend batch failed:', error.message);
                failed += chunk.length;
            } else {
                sent += chunk.length;
            }
        } catch (e) {
            console.error('Resend batch threw:', e);
            failed += chunk.length;
        }
    }

    // Best-effort history row: bookkeeping must never fail a send that
    // already went out (and must survive the table not existing yet).
    if (sent > 0) {
        try {
            const { error } = await supabaseAdmin
                .from('email_sends')
                .insert({ kind, subject, recipient_count: sent, sent_by: sentBy });
            if (error) console.error('[email] could not record email_sends row:', error.message);
        } catch (e) {
            console.error('[email] could not record email_sends row:', e);
        }
    }

    return { sent, failed };
}
