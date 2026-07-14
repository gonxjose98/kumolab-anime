import { Resend } from 'resend';
import { supabaseAdmin } from '@/lib/supabase/admin';

/**
 * Transactional order emails + buyer capture (Q6).
 *
 * A paying customer is the most valuable subscriber, and the checkout success
 * page already promises a confirmation email, so both must be real:
 *   - recordBuyer()          adds the buyer to the owned email list.
 *   - sendOrderConfirmation() sends the on-brand confirmation via Resend.
 * Both are best-effort and NEVER throw: a failure here must not break the
 * Stripe webhook (the customer has already paid).
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

const money = (n: number): string => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
const esc = (s: string): string =>
    (s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

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
        const firstName = esc((input.name || '').trim().split(/\s+/)[0] || 'there');

        const rows = input.lines
            .map(
                (l) =>
                    `<tr><td style="padding:7px 0;color:#28374a;">${esc(String(l.quantity))}&times; ${esc(l.name)}</td>` +
                    `<td align="right" style="padding:7px 0;color:#28374a;">${money(l.amount)}</td></tr>`,
            )
            .join('');

        const html = `
<div style="background:#eef5fc;padding:32px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(24,70,120,.12);">
    <div style="background:linear-gradient(135deg,#8fc2f1 0%,#c3e0fb 55%,#fff5e2 100%);padding:26px 32px;text-align:center;">
      <img src="https://kumolabanime.com/kumolab-cloud-mark-gold.png" width="58" height="auto" alt="" style="display:inline-block;margin-bottom:4px;" />
      <div style="font-size:24px;font-weight:800;color:#16324f;letter-spacing:-.02em;">KumoLab</div>
    </div>
    <div style="padding:28px 32px;">
      <h1 style="font-size:20px;margin:0 0 8px;color:#16324f;">Thanks for your order, ${firstName}.</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#46688c;">
        Your order is confirmed and we are getting it ready. Order <b>#${esc(input.orderNumber)}</b>.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${rows}
        <tr><td style="padding:9px 0 6px;border-top:1px solid #e6eef7;color:#46688c;">Subtotal</td><td align="right" style="padding:9px 0 6px;border-top:1px solid #e6eef7;color:#46688c;">${money(input.subtotal)}</td></tr>
        <tr><td style="padding:2px 0;color:#46688c;">Shipping</td><td align="right" style="padding:2px 0;color:#46688c;">${money(input.shipping)}</td></tr>
        <tr><td style="padding:8px 0;font-weight:800;color:#16324f;font-size:15px;">Total</td><td align="right" style="padding:8px 0;font-weight:800;color:#16324f;font-size:15px;">${money(input.total)}</td></tr>
      </table>
      <p style="margin:22px 0 0;font-size:14px;line-height:1.6;color:#46688c;">
        We will email you tracking as soon as it ships. Questions about your order? Just reply to this email.
      </p>
    </div>
    <div style="padding:16px 32px;text-align:center;font-size:12px;color:#8aa3bd;background:#f6fafe;">
      KumoLab &middot; the cloud sees everything first
    </div>
  </div>
</div>`.trim();

        const text =
            `Thanks for your order, ${(input.name || 'there').split(/\s+/)[0]}.\n\n` +
            `Your order is confirmed. Order #${input.orderNumber}.\n\n` +
            input.lines.map((l) => `  ${l.quantity}x ${l.name}  ${money(l.amount)}`).join('\n') +
            `\n\n  Subtotal  ${money(input.subtotal)}\n  Shipping  ${money(input.shipping)}\n  Total     ${money(input.total)}\n\n` +
            `We will email you tracking as soon as it ships. Questions? Just reply to this email.\n\nKumoLab`;

        const { error } = await resend.emails.send({
            from: FROM,
            to,
            replyTo: REPLY_TO,
            subject: `Your KumoLab order is confirmed (#${input.orderNumber})`,
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
