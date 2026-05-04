import { NextRequest, NextResponse } from 'next/server';

// Meta hits this endpoint when a user revokes our app's permissions.
// We don't have user-bound state to clean up (the only user is
// kumolabanime itself, controlled by the operator), so we acknowledge
// the request and rely on the next cron tick to fail loudly when the
// token stops working — which prompts a manual re-auth via the callback
// route. Returns 200 immediately to satisfy Meta's contract.

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const body = await req.text();
        console.log('[ThreadsDeauth] Received deauth ping:', body.substring(0, 500));
    } catch {
        // ignore parse errors — Meta still wants 200
    }
    return NextResponse.json({ ok: true });
}

export async function GET() {
    return NextResponse.json({ ok: true, hint: 'POST endpoint for Threads deauth ping' });
}
