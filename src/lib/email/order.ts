import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getEmailCopy, renderOrderConfirmation, renderCartRecovery } from '@/lib/email/templates';

/**
 * Transactional order emails + buyer capture (Q6).
 *
 * A paying customer is the most valuable subscriber, and the checkout success
 * page already promises a confirmation email, so both must be real:
 *   - recordBuyer()          adds the buyer to the owned email list.
 *   - sendOrderConfirmation() sends the on-brand confirmation via Resend.
 * Both are best-effort and NEVER throw: a failure here must not break the
 * Stripe webhook (the customer has already paid).
 *
 * Wording comes from getEmailCopy() (admin-editable on /admin/email) which
 * itself never throws and falls back to the hardcoded defaults, so the
 * webhook-safety contract holds. Layout lives in templates.ts.
 */

const FROM = process.env.ORDER_EMAIL_FROM || 'KumoLab <shop@kumolabanime.com>';
const REPLY_TO = process.env.ORDER_REPLY_TO || 'kumolabanime@gmail.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface OrderLine {
    name: string;
    quantity: number;
    amount: number; // line total, in dollars
}

/** Add a paying customer to the self-owned email list. Idempotent, never throws. */
export async function recordBuyer(email?: string | null, name?: string | null): Promise<void> {
    try {
        const e = (email || '').trim().toLowerCase();
        if (!e || !EMAIL_RE.test(e)) return;
        // Upsert on email (same pattern as /api/subscribe): buying again, or
        // after unsubscribing, simply re-subscribes without a duplicate row.
        await supabaseAdmin.from('email_subscribers').upsert(
            { email: e, name: name || null, status: 'subscribed', source: 'purchase', unsubscribed_at: null },
            { onConflict: 'email' },
        );
    } catch (err) {
        console.error('[order email] recordBuyer failed:', err);
    }
}

/** Send the branded order-confirmation email. Best-effort, never throws. */
export async function sendOrderConfirmation(input: {
    to?: string | null;
    name?: string | null;
    orderNumber: string;
    lines: OrderLine[];
    subtotal: number;
    shipping: number;
    total: number;
}): Promise<boolean> {
    try {
        const to = (input.to || '').trim();
        if (!to || !EMAIL_RE.test(to)) return false;

        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            console.error('[order email] RESEND_API_KEY not set, confirmation not sent');
            return false;
        }
        const resend = new Resend(apiKey);
        const firstName = (input.name || '').trim().split(/\s+/)[0] || 'there';

        // Admin-editable wording; getEmailCopy never throws (defaults win on any failure).
        const copy = await getEmailCopy('order_confirmation');
        const { subject, html, text } = renderOrderConfirmation(copy, {
            firstName,
            orderNumber: input.orderNumber,
            lines: input.lines,
            subtotal: input.subtotal,
            shipping: input.shipping,
            total: input.total,
        });

        const { error } = await resend.emails.send({
            from: FROM,
            to,
            replyTo: REPLY_TO,
            subject,
            html,
            text,
        });
        if (error) {
            console.error('[order email] confirmation send failed:', error.message);
            return false;
        }
        return true;
    } catch (err) {
        console.error('[order email] sendOrderConfirmation threw:', err);
        return false;
    }
}

export interface AbandonedCartItem {
    name?: string;
    quantity?: number;
}

/**
 * Send ONE cart-recovery email for an expired checkout session (B6).
 * Same contract as sendOrderConfirmation: best-effort, NEVER throws —
 * a send failure must not break the Stripe webhook.
 */
export async function sendCartRecoveryEmail(
    email?: string | null,
    items?: AbandonedCartItem[] | null,
): Promise<boolean> {
    try {
        const to = (email || '').trim();
        if (!to || !EMAIL_RE.test(to)) return false;

        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            console.error('[order email] RESEND_API_KEY not set, cart recovery not sent');
            return false;
        }
        const resend = new Resend(apiKey);

        // Admin-editable wording; getEmailCopy never throws (defaults win on any failure).
        const copy = await getEmailCopy('cart_recovery');
        const { subject, html, text } = renderCartRecovery(copy, items || []);

        const { error } = await resend.emails.send({
            from: 'KumoLab <news@kumolabanime.com>',
            to,
            replyTo: REPLY_TO,
            subject,
            html,
            text,
        });
        if (error) {
            console.error('[order email] cart recovery send failed:', error.message);
            return false;
        }
        return true;
    } catch (err) {
        console.error('[order email] sendCartRecoveryEmail threw:', err);
        return false;
    }
}
