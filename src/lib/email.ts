
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

    console.log(`[Email Service] Sending branded shipping email to ${to}`);
    console.log(`Order: ${orderId} | Carrier: ${carrier} | Tracking: ${trackingNumber}`);
    console.log(`Tracking Link: ${trackingUrl}`);

    // IMPLEMENTATION: Integrate with Resend, SendGrid, or Postmark here.
    /*
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: 'KumoLab <shop@kumolabanime.com>',
            to,
            subject: 'Artifact Shipped: Your KumoLab order is on the way!',
            html: `<h1>Good news!</h1><p>Order #${orderId} has been shipped via ${carrier}.</p><p>Track it here: <a href="${trackingUrl}">${trackingNumber}</a></p>`
        })
    });
    */
}
