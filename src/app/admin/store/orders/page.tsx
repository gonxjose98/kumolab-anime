import { fetchOrders } from '@/lib/orders';
import OrdersBoard from '@/components/admin/orders/OrdersBoard';

export const dynamic = 'force-dynamic';

export default async function StoreOrdersPage() {
    // Live from Printful — every order flows there via the Stripe webhook, so
    // this is the true, always-current picture of what's come in and shipped.
    const { orders, error } = await fetchOrders(150);

    return (
        <div>
            <div className="ak-card" style={{ marginBottom: '18px', maxWidth: '820px' }}>
                <p className="ak-body-sm" style={{ margin: 0 }}>
                    Every order customers place flows straight to <strong>Printful</strong> for fulfilment, and this
                    board reads it live. Follow each one along the track: <strong>Received</strong> → <strong>In
                    production</strong> → <strong>Shipped</strong> → <strong>Delivered</strong>. Open an order to see
                    the items and a direct carrier tracking link the moment it ships.
                </p>
            </div>
            <OrdersBoard orders={orders} error={error} />
        </div>
    );
}
