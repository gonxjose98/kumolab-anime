import { getAnimeTiers } from '@/lib/engine/anime-tiers';
import { getPostFormula, getPeakSlots, getScheduledQueue, getProjectGoals } from '@/lib/engine/engine-config';
import { getFaults } from '@/lib/engine/faults';
import { getRecentRuns } from '@/lib/engine/worker-runs';
import { supabaseAdmin } from '@/lib/supabase/admin';
import EngineShell from '@/components/admin/engine/EngineShell';
import type { HealthCheckLite } from '@/components/admin/engine/blueprint/types';

/**
 * /admin/engine — the live system blueprint.
 *
 * Replaced the original four stacked cards (formula / peak slots / scheduled
 * feed / tiers) on 2026-08-01. Nothing was dropped: the formula moved into the
 * brief popup, the peak-slot editor and the scheduled feed were both absorbed
 * into the 24h clock, and the tiers are unchanged below the fold.
 *
 * Everything is fetched here, server-side, and handed down as initial state so
 * the page renders complete rather than flashing skeletons; the canvas then
 * polls /api/admin/engine/state for updates.
 */

export const dynamic = 'force-dynamic';

export default async function EnginePage() {
    const [tiers, formula, goals, slots, queue, runs, faultState, health, agents] = await Promise.all([
        getAnimeTiers().catch(() => []),
        getPostFormula(),
        getProjectGoals(),
        getPeakSlots(),
        getScheduledQueue(),
        getRecentRuns().catch(() => []),
        getFaults().catch(() => ({ faults: [], healthAgeMinutes: null })),
        readHealthChecks(),
        readAgents(),
    ]);

    return (
        <div className="max-w-6xl mx-auto min-w-0">
            <EngineShell
                live={{
                    generatedAt: new Date().toISOString(),
                    runs,
                    health: {
                        checks: health.checks,
                        checkedAt: health.checkedAt,
                        ageMinutes: faultState.healthAgeMinutes,
                    },
                    agents,
                }}
                faults={faultState.faults}
                healthAgeMinutes={faultState.healthAgeMinutes}
                slots={slots}
                queue={queue}
                tiers={tiers}
                formula={formula}
                goals={goals}
            />
        </div>
    );
}

/**
 * The health checks come from the snapshot the health-monitor cron persists,
 * NOT from getHealthSnapshot(). That function makes 11 checks including a
 * network call to the Render worker with a 60-second timeout — calling it on
 * page render would make the tab feel broken.
 */
async function readHealthChecks(): Promise<{ checks: HealthCheckLite[]; checkedAt: string | null }> {
    try {
        const { data } = await supabaseAdmin
            .from('engine_config').select('value').eq('key', 'health_snapshot').maybeSingle();
        const snap = data?.value as { checks?: HealthCheckLite[]; checkedAt?: string } | undefined;
        return { checks: snap?.checks ?? [], checkedAt: snap?.checkedAt ?? null };
    } catch {
        return { checks: [], checkedAt: null };
    }
}

async function readAgents() {
    try {
        const { data } = await supabaseAdmin
            .from('agent_sessions')
            .select('agent, activity, node_id, updated_at')
            .gt('expires_at', new Date().toISOString())
            .limit(20);
        return data ?? [];
    } catch {
        return [];
    }
}
