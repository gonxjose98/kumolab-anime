/**
 * Shared client-side shapes for the blueprint.
 *
 * Kept separate from the server modules so client components never reach
 * through to anything that imports supabaseAdmin (which throws at module load
 * in the browser).
 */

export interface WorkerRunLite {
    id: string;
    worker: string;
    started_at: string;
    finished_at: string | null;
    ok: boolean | null;
    duration_ms: number | null;
    result: Record<string, unknown> | null;
    error: string | null;
}

export interface AgentPresence {
    agent: string;
    activity: string | null;
    node_id: string | null;
    updated_at: string;
}

export interface HealthCheckLite {
    key: string;
    label: string;
    level: 'ok' | 'warn' | 'crit';
    detail: string;
    actionable?: string;
}

export interface BlueprintLiveState {
    generatedAt: string;
    runs: WorkerRunLite[];
    health: { checks: HealthCheckLite[]; checkedAt: string | null; ageMinutes: number | null };
    agents: AgentPresence[];
}
