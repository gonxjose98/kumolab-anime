/**
 * /api/admin/orders/confirm
 *
 * Operator approves a paid, draft Printful order. This confirms it for
 * fulfillment, which is the moment Printful charges the store's billing
 * method (manual-approval flow — Jose, 2026-07-11). Nothing is charged until
 * this is called. Auth: middleware gates /api/admin/*.
 */

import { NextRequest, NextResponse } from 'next/server';
import { confirmPrintfulOrder } from '@/lib/printful';
import { logAction } from '@/lib/logging/structured-logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const orderId = body?.orderId;
        if (orderId == null || (typeof orderId !== 'number' && typeof orderId !== 'string')) {
            return NextResponse.json({ success: false, error: 'orderId is required' }, { status: 400 });
        }

        const result = await confirmPrintfulOrder(orderId);
        await logAction({
            action: 'order_approved',
            entityType: 'order',
            entityId: String(orderId),
            actor: 'Admin',
            reason: `Approved order ${orderId} → sent to Printful for fulfillment`,
        }).catch(() => {});

        return NextResponse.json({ success: true, order: result });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'Failed to approve order' }, { status: 500 });
    }
}
