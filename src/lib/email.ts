import { Resend } from 'resend';

const SHIP_FROM = process.env.ORDER_EMAIL_FROM || 'KumoLab <shop@kumolabanime.com>';
const SHIP_REPLY_TO = process.env.ORDER_REPLY_TO || 'kumolabanime@gmail.com';

export function getCarrierTrackingUrl(carrier: string, trackingNumber: string): string {
    const c = carrier.toLowerCase();

    if (c.includes('usps')) {
        return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`;
    }
    if (c.includes('ups')) {
        return `https://www.ups.com/track?loc=en_US&tracknum=${trackingNumber}`;
    }
    if (c.includes('fedex')) {
        return `https://www.fedex.com/apps/fedextrack/?tracknumbers=${trackingNumber}`;
    }
    if (c.includes('dhl')) {
        return `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`;
    }

    // Fallback if carrier is unknown - some carriers might be just a name
    return `https://www.google.com/search?q=${carrier}+tracking+${trackingNumber}`;
}

export async function sendShippingEmail({
    to,
    orderId,
    carrier,
    trackingNumber
}: {
    to: string,
    orderId: string,
    carrier: string,
    trackingNumber: string
}) {
    const trackingUrl = getCarrierTrackingUrl(carrier, trackingNumber);
    const orderNumber = String(orderId || '').slice(-8).toUpperCase();

    try {
        const recipient = (to || '').trim();
        if (!recipient) return false;
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            console.error('[order email] RESEND_API_KEY not set, shipping email not sent');
            return false;
        }
        const resend = new Resend(apiKey);

        const html = `
<div style="background:#eef5fc;padding:32px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(24,70,120,.12);">
    <div style="background:linear-gradient(135deg,#8fc2f1 0%,#c3e0fb 55%,#fff5e2 100%);padding:26px 32px;text-align:center;">
      <img src="https://kumolabanime.com/kumolab-cloud-mark-gold.png" width="58" height="auto" alt="" style="display:inline-block;margin-bottom:4px;" />
      <div style="font-size:24px;font-weight:800;color:#16324f;letter-spacing:-.02em;">KumoLab</div>
    </div>
    <div style="padding:28px 32px;">
      <h1 style="font-size:20px;margin:0 0 8px;color:#16324f;">Your order is on the way.</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#46688c;">
        Order <b>#${orderNumber}</b> has shipped via ${carrier}. You can follow it with the tracking number below.
      </p>
      <div style="text-align:center;margin:8px 0 22px;">
        <a href="${trackingUrl}" style="display:inline-block;background:linear-gradient(135deg,#ffe397 0%,#ffbe55 55%,#ff9f3e 100%);color:#3a2708;font-weight:800;text-decoration:none;padding:13px 26px;border-radius:12px;">Track your order</a>
      </div>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#8aa3bd;text-align:center;">${carrier} &middot; ${trackingNumber}</p>
    </div>
    <div style="padding:16px 32px;text-align:center;font-size:12px;color:#8aa3bd;background:#f6fafe;">
      KumoLab &middot; the cloud sees everything first
    </div>
  </div>
</div>`.trim();

        const text =
            `Your KumoLab order #${orderNumber} has shipped via ${carrier}.\n\n` +
            `Track it: ${trackingUrl}\n${carrier} ${trackingNumber}\n\nKumoLab`;

        const { error } = await resend.emails.send({
            from: SHIP_FROM,
            to: recipient,
            replyTo: SHIP_REPLY_TO,
            subject: `Your KumoLab order has shipped (#${orderNumber})`,
            html,
            text,
        });
        if (error) {
            console.error('[order email] shipping send failed:', error.message);
            return false;
        }
        return true;
    } catch (err) {
        console.error('[order email] sendShippingEmail threw:', err);
        return false;
    }
}
