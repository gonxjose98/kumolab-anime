// Explore knobs. All env-overridable, all server-only.

export const exploreConfig = {
    /** Kill switch: set EXPLORE_ENABLED=false to stop every model call. Default on. */
    enabled: () => process.env.EXPLORE_ENABLED !== 'false',
    /** True when the Claude key exists. Never expose the key itself. */
    hasKey: () => !!process.env.ANTHROPIC_API_KEY,
    /** Anime world + Our numbers. */
    model: () => process.env.EXPLORE_MODEL || 'claude-sonnet-5',
    /** System status phrasing only; Our numbers uses the main model. */
    lightModel: () => process.env.EXPLORE_MODEL_LIGHT || 'claude-haiku-4-5-20251001',
    maxManualPerDay: () => Number(process.env.EXPLORE_MAX_MANUAL_PER_DAY || 3),
    cooldownMinutes: () => Number(process.env.EXPLORE_COOLDOWN_MINUTES || 180),
    monthlyCapUsd: () => Number(process.env.EXPLORE_MONTHLY_CAP_USD || 25),
};

/** $ per 1M tokens [input, output]. Unknown models are priced high on purpose. */
const PRICES: Record<string, [number, number]> = {
    'claude-sonnet-5': [2, 10],
    'claude-haiku-4-5': [1, 5],
    'claude-haiku-4-5-20251001': [1, 5],
    'claude-opus-5': [5, 25],
};

export function costUsd(model: string, input: number, output: number): number {
    const [i, o] = PRICES[model] ?? [5, 25];
    return (input * i + output * o) / 1_000_000;
}

/** Card lifetimes by section. */
export const TTL_HOURS: Record<string, number> = { world: 48, ours: 24 * 7, system: 24 };
