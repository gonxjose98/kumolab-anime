import { NextResponse } from 'next/server';
import { verifyX, xConfigured } from '@/lib/social/x-client';

export const dynamic = 'force-dynamic';

// Confirms the X keys work by reading the authed account. Returns the handle
// and counts only, never the keys. One owned read (~$0.001).
export async function GET() {
    if (!xConfigured()) return NextResponse.json({ ok: false, error: 'X keys not set' }, { status: 503 });
    try {
        const me = await verifyX();
        return NextResponse.json({ ok: true, autoPublish: process.env.X_AUTO_PUBLISH === 'true', ...me });
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 300) }, { status: 200 });
    }
}
