import { Resend } from 'resend';
import { getEmailCopy, renderWelcome } from '@/lib/email/templates';

/**
 * The signup welcome email: one branded hello when someone new joins the
 * list from the homepage. Gated by WELCOME_EMAIL_ENABLED=true (checked by
 * the caller, /api/subscribe) so nothing sends until the owner turns it on.
 *
 * Same contract as the order emails: best-effort, NEVER throws — a send
 * failure must not break the signup. Wording is admin-editable on
 * /admin/email via getEmailCopy('welcome'); layout lives in templates.ts.
 */

const FROM = process.env.EMAIL_FROM || 'KumoLab <news@kumolabanime.com>';
const REPLY_TO = process.env.ORDER_REPLY_TO || 'kumolabanime@gmail.com';
const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://kumolabanime.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Send the welcome email to a brand-new subscriber. Best-effort, never throws. */
export async function sendWelcomeEmail(
    email?: string | null,
    unsubscribeToken?: string | null,
): Promise<boolean> {
    try {
        const to = (email || '').trim();
        if (!to || !EMAIL_RE.test(to)) return false;

        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            console.error('[welcome email] RESEND_API_KEY not set, welcome not sent');
            return false;
        }
        const resend = new Resend(apiKey);

        // Admin-editable wording; getEmailCopy never throws (defaults win on any failure).
        const copy = await getEmailCopy('welcome');
        const rendered = renderWelcome(copy);

        // Personalized unsubscribe (same pattern as sendBroadcast): the welcome
        // goes to list members, so it must carry a working opt-out.
        let html = rendered.html;
        let text = rendered.text;
        let headers: Record<string, string> | undefined;
        if (unsubscribeToken) {
            const unsubUrl = `${BASE}/api/email/unsubscribe?token=${unsubscribeToken}`;
            html +=
                `<p style="margin-top:28px;font-size:12px;color:#8a8f98;text-align:center;">` +
                `You're receiving this because you joined the KumoLab list. ` +
                `<a href="${unsubUrl}" style="color:#8a8f98;">Unsubscribe</a></p>`;
            text += `\n\nUnsubscribe: ${unsubUrl}`;
            headers = {
                'List-Unsubscribe': `<${unsubUrl}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            };
        }

        const { error } = await resend.emails.send({
            from: FROM,
            to,
            replyTo: REPLY_TO,
            subject: rendered.subject,
            html,
            text,
            headers,
        });
        if (error) {
            console.error('[welcome email] send failed:', error.message);
            return false;
        }
        return true;
    } catch (err) {
        console.error('[welcome email] sendWelcomeEmail threw:', err);
        return false;
    }
}
