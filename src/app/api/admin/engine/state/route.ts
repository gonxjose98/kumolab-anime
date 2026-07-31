import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { BLUEPRINT } from '@/lib/engine/blueprint';
import { getRecentRuns } from '@/lib/engine/worker-runs';
import { getFaults } from '@/lib/engine/faults';
import { getPeakSlots, getScheduledQueue } from '@/lib/engine/engine-config';
import { getAnimeTiers } from '@/lib/engine/anime-tiers';

/**
 * GET /api/admin/engine/state — the whole system, in one call.
 *
 * This is the contract an external AI agent connects to. It exists so an agent
 * can answer "what is this system, what is it doing right now, and what is
 * broken?" without scraping the UI or being handed a dozen endpoints.
 *
 * Auth: a normal admin cookie session, OR `Authorization: Bearer
 * ${AGENT_API_KEY}` — see the AGENT_BEARER_API branch in middleware.ts. The
 * middleware runs before this handler, so by the time we are here the caller is
 * already authorised.
 *
 * WHAT MUST NEVER GO IN THE RESPONSE: secrets, tokens, API keys, customer or
 * order data. Only operational metadata. Node definitions carry env var NAMES
 * (e.g. "STRIPE_SECRET_KEY") deliberately — the name is documentation, the
 * value never appears. A route test asserts this.
 */

export const dynamic = 'force-dynamic';

/** Bump when a consumer would need to change. Agents can detect a break. */
const CONTRACT_VERSION = 1;

export async function GET() {
    try {
        const [runs, faultState, slots, queue, tiers, agents] = await Promise.all([
            getRecentRuns().catch(() => []),
            getFaults().catch(() => ({ faults: [], healthAgeMinutes: null })),
            getPeakSlots().catch(() => []),
            getScheduledQueue().catch(() => []),
            getAnimeTiers().catch(() => []),
            readAgents(),
        ]);

        // Health checks are served from the snapshot the health-monitor cron
        // persists, NOT recomputed here: getHealthSnapshot() makes 11 checks
        // including a 60-second-timeout call to the Render worker, which would
        // make this endpoint unusable.
        const health = await readHealthSnapshot();

        return NextResponse.json({
            contract: CONTRACT_VERSION,
            generatedAt: new Date().toISOString(),
            graph: BLUEPRINT,
            runs,
            health: {
                checks: health?.checks ?? [],
                overall: health?.overall ?? null,
                checkedAt: health?.checkedAt ?? null,
                ageMinutes: faultState.healthAgeMinutes,
            },
            faults: faultState.faults,
            slots,
            queue,
            tiers,
            agents,
        });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'state read failed';
        return NextResponse.json({ contract: CONTRACT_VERSION, error: msg }, { status: 500 });
    }
}

async function readHealthSnapshot(): Promise<{
    overall: string;
    checks: { key: string; label: string; level: string; detail: string; actionable?: string }[];
    checkedAt: string;
} | null> {
    try {
        const { data } = await supabaseAdmin
            .from('engine_config').select('value').eq('key', 'health_snapshot').maybeSingle();
        return (data?.value as never) ?? null;
    } catch {
        return null;
    }
}

async function readAgents() {
    try {
        const { data } = await supabaseAdmin
            .from('agent_sessions')
            .select('agent, activity, node_id, updated_at')
            .gt('expires_at', new Date().toISOString())
            .order('updated_at', { ascending: false })
            .limit(20);
        return data ?? [];
    } catch {
        return [];
    }
}
