import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { NODES_BY_ID } from '@/lib/engine/blueprint';

/**
 * POST /api/admin/agent/heartbeat — "I am an agent and I am working on X."
 *
 * Body: { agent: string, activity?: string, nodeId?: string }
 *
 * An agent that has beaten within the TTL shows up on the blueprint canvas as a
 * marker orbiting the node it named, so Jose can watch work happen live.
 *
 * Auth: admin cookie session OR `Authorization: Bearer ${AGENT_API_KEY}` — see
 * AGENT_BEARER_API in middleware.ts. The path deliberately sits under
 * /api/admin: the middleware matcher does not cover /api/agent/*, so a route
 * there would be an unauthenticated public WRITE endpoint.
 *
 * IMPORTANT, and worth repeating wherever this data is consumed: presence is
 * SELF-REPORTED and advisory. It reflects what an agent claims to be doing. It
 * is not a security boundary and it is not evidence that any work happened —
 * worker_runs is the only thing that evidences that.
 */

export const dynamic = 'force-dynamic';

const TTL_MS = 3 * 60 * 1000;
const MAX_LEN = 200;

export async function POST(req: NextRequest) {
    let body: { agent?: unknown; activity?: unknown; nodeId?: unknown };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, reason: 'invalid JSON body' }, { status: 400 });
    }

    const agent = typeof body.agent === 'string' ? body.agent.trim().slice(0, 80) : '';
    if (!agent) {
        return NextResponse.json({ ok: false, reason: 'agent is required' }, { status: 400 });
    }

    const activity = typeof body.activity === 'string' ? body.activity.trim().slice(0, MAX_LEN) : null;

    // Only accept a node id that actually exists on the map. An unknown id
    // would render nowhere and silently look like the heartbeat failed.
    const rawNode = typeof body.nodeId === 'string' ? body.nodeId.trim() : '';
    const nodeId = rawNode && NODES_BY_ID[rawNode] ? rawNode : null;
    if (rawNode && !nodeId) {
        return NextResponse.json(
            { ok: false, reason: `unknown nodeId "${rawNode}" — see graph.nodes from /api/admin/engine/state` },
            { status: 400 },
        );
    }

    const now = new Date();
    const { error } = await supabaseAdmin.from('agent_sessions').upsert(
        {
            agent,
            activity,
            node_id: nodeId,
            updated_at: now.toISOString(),
            expires_at: new Date(now.getTime() + TTL_MS).toISOString(),
        },
        { onConflict: 'agent' },
    );

    if (error) {
        return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, agent, nodeId, expiresInMs: TTL_MS });
}

/** Clear presence when an agent finishes, rather than waiting out the TTL. */
export async function DELETE(req: NextRequest) {
    const agent = req.nextUrl.searchParams.get('agent');
    if (!agent) {
        return NextResponse.json({ ok: false, reason: 'agent query param required' }, { status: 400 });
    }
    await supabaseAdmin.from('agent_sessions').delete().eq('agent', agent);
    return NextResponse.json({ ok: true });
}
