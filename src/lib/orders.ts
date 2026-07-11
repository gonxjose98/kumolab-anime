import { getCarrierTrackingUrl } from '@/lib/email';

/*
 * Orders — read live from Printful.
 *
 * Every KumoLab order already lives in Printful: the Stripe webhook creates it
 * on `checkout.session.completed` with `external_id` set to the Stripe session
 * id (see api/webhooks/stripe). So the single source of truth for "what orders
 * came in and where are they" is Printful's own order list — no local mirror to
 * drift out of sync. We read it through, normalize it, and map Printful's status
 * onto the four stages the operator cares about:
 *
 *   received → production → shipped → delivered   (+ canceled off-track)
 *
 * i.e. "order came in → being fulfilled by Printful → order sent → confirmed".
 */

const PRINTFUL_API_URL = 'https://api.printful.com';
const ACCESS_TOKEN = process.env.PRINTFUL_ACCESS_TOKEN;

// 'awaiting' = customer paid, Printful order created as a DRAFT (confirm:false),
// waiting for the operator to approve before Printful charges + produces it.
export type OrderStage = 'awaiting' | 'received' | 'production' | 'shipped' | 'delivered' | 'canceled';

export interface OrderShipment {
    carrier: string;
    service: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null; // carrier deep-link (falls back to Printful's own url)
    shipDate: string | null; // ISO
}

export interface OrderItem {
    name: string;
    quantity: number;
    price: number; // retail unit price
    thumbnail: string | null;
}

export interface KumoOrder {
    id: number; // Printful order id
    externalId: string | null; // Stripe checkout session id
    stage: OrderStage;
    rawStatus: string; // Printful's own status string
    customerName: string;
    customerEmail: string | null;
    destination: string; // "City, ST, US"
    itemCount: number;
    items: OrderItem[];
    total: number;
    currency: string;
    shipments: OrderShipment[];
    createdAt: string; // ISO
    updatedAt: string; // ISO
}

// Printful order status → our stage. Printful statuses:
// draft, pending, failed, canceled, inprocess, onhold, partial, fulfilled, archived.
const STAGE_BY_STATUS: Record<string, OrderStage> = {
    draft: 'awaiting',   // paid, needs your approval before it's charged + made
    pending: 'received', // approved/confirmed, queued at Printful
    inprocess: 'production',
    onhold: 'production',
    partial: 'production',
    fulfilled: 'shipped',
    shipped: 'shipped',
    archived: 'shipped',
    canceled: 'canceled',
    cancelled: 'canceled',
    failed: 'canceled',
};

function isoFromUnix(secs: unknown): string {
    const n = Number(secs);
    if (!Number.isFinite(n) || n <= 0) return '';
    return new Date(n * 1000).toISOString();
}

function toStage(status: string, shipments: any[]): OrderStage {
    const base = STAGE_BY_STATUS[String(status || '').toLowerCase()] ?? 'received';
    // A shipment carrying a tracking number means it's physically out the door,
    // even if Printful still reports the order as inprocess/partial.
    if ((base === 'received' || base === 'production') && shipments?.some((s) => s?.tracking_number)) {
        return 'shipped';
    }
    return base;
}

function normalize(o: any): KumoOrder {
    const rawShipments: any[] = Array.isArray(o.shipments) ? o.shipments : [];
    const shipments: OrderShipment[] = rawShipments.map((s: any) => {
        const carrier = s.carrier || '';
        const tn = s.tracking_number || null;
        const trackingUrl = tn && carrier ? getCarrierTrackingUrl(carrier, tn) : (s.tracking_url || null);
        return {
            carrier,
            service: s.service || null,
            trackingNumber: tn,
            trackingUrl,
            shipDate: s.ship_date ? String(s.ship_date) : isoFromUnix(s.shipped_at) || null,
        };
    });

    const r = o.recipient || {};
    const destination = [r.city, r.state_code, r.country_code].filter(Boolean).join(', ');
    const costs = o.retail_costs || o.costs || {};
    const items: OrderItem[] = (Array.isArray(o.items) ? o.items : []).map((it: any) => ({
        name: it.name || 'Item',
        quantity: Number(it.quantity || 1),
        price: parseFloat(it.retail_price || '0') || 0,
        thumbnail:
            it.files?.find((f: any) => f.type === 'preview')?.thumbnail_url ||
            it.product?.image ||
            null,
    }));

    return {
        id: Number(o.id),
        externalId: o.external_id || null,
        stage: toStage(o.status, rawShipments),
        rawStatus: String(o.status || ''),
        customerName: r.name || '—',
        customerEmail: r.email || null,
        destination: destination || '—',
        itemCount: items.reduce((n, it) => n + it.quantity, 0),
        items,
        total: parseFloat(costs.total || '0') || 0,
        currency: costs.currency || 'USD',
        shipments,
        createdAt: isoFromUnix(o.created),
        updatedAt: isoFromUnix(o.updated),
    };
}

export interface OrdersResult {
    orders: KumoOrder[];
    error: string | null;
}

/**
 * Pull the store's orders from Printful (most recent first), paginating up to
 * `limitTotal`. Never throws: a Printful outage degrades to whatever we managed
 * to fetch plus a human-readable `error` the UI can surface, rather than a 500.
 */
export async function fetchOrders(limitTotal = 100): Promise<OrdersResult> {
    if (!ACCESS_TOKEN) {
        return { orders: [], error: 'Printful is not connected (PRINTFUL_ACCESS_TOKEN missing).' };
    }

    const collected: any[] = [];
    const pageSize = 100;
    let offset = 0;

    try {
        while (collected.length < limitTotal) {
            const res = await fetch(`${PRINTFUL_API_URL}/orders?offset=${offset}&limit=${pageSize}`, {
                headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
                cache: 'no-store',
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                const msg = body?.error?.message || body?.result || `Printful returned ${res.status}`;
                return { orders: finalize(collected, limitTotal), error: String(msg) };
            }
            const data = await res.json();
            const batch: any[] = Array.isArray(data.result) ? data.result : [];
            collected.push(...batch);
            const total = data.paging?.total ?? collected.length;
            offset += pageSize;
            if (batch.length < pageSize || offset >= total) break;
        }
    } catch (e: any) {
        return { orders: finalize(collected, limitTotal), error: e?.message || 'Failed to reach Printful.' };
    }

    return { orders: finalize(collected, limitTotal), error: null };
}

function finalize(raw: any[], limitTotal: number): KumoOrder[] {
    return raw
        .map(normalize)
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, limitTotal);
}
