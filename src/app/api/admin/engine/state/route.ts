import { NextResponse } from 'next/server';
import { getAgentState, CONTRACT_VERSION } from '@/lib/engine/agent-state';

/**
 * GET /api/admin/engine/state — the whole system, in one call.
 *
 * This is the contract an external AI agent connects to. It exists so an agent
 * can answer "what is this system, what rules does it run on, what is moving
 * through it right now, and what is broken?" without scraping the UI or being
 * handed a dozen endpoints.
 *
 * The assembly lives in lib/engine/agent-state.ts; this route is only the
 * transport, so the same payload can be reused server-side without an HTTP hop.
 *
 * Auth: a normal admin cookie session, OR `Authorization: Bearer
 * ${AGENT_API_KEY}` — see the AGENT_BEARER_API branch in middleware.ts. The
 * middleware runs before this handler, so by the time we are here the caller is
 * already authorised.
 *
 * WHAT MUST NEVER GO IN THE RESPONSE: secrets, tokens, API keys, customer or
 * order data. Only operational metadata. Node definitions carry env var NAMES
 * (e.g. "STRIPE_SECRET_KEY") deliberately — the name is documentation, the
 * value never appears. A test asserts this.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        return NextResponse.json(await getAgentState());
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'state read failed';
        return NextResponse.json({ contract: CONTRACT_VERSION, error: msg }, { status: 500 });
    }
}
