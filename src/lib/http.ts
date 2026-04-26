/**
 * Shared HTTP helpers.
 *
 * Use fetchWithTimeout for any external API call — without it a hung upstream
 * (AniList, Meta Graph, AI provider, etc.) blocks the cron worker for the full
 * Vercel function timeout, starving every other job.
 */

export const DEFAULT_TIMEOUT_MS = 10_000;

export async function fetchWithTimeout(
    url: string | URL,
    init?: RequestInit,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(t);
    }
}
