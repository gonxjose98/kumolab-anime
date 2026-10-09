import { NextRequest, NextResponse } from 'next/server';
import { getWireItems } from '@/lib/discover/queries';

export const dynamic = 'force-dynamic';

/** GET /api/admin/wire?kind=news&offset=50 — paged Anime Wire rows (session-gated by middleware). */
export async function GET(req: NextRequest) {
    const sp = req.nextUrl.searchParams;
    const items = await getWireItems({
        kind: sp.get('kind'),
        offset: Number(sp.get('offset')) || 0,
        limit: Number(sp.get('limit')) || 50,
    });
    return NextResponse.json({ items });
}
