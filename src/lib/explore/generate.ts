/**
 * Explore worker: digest -> Claude (one call per section) -> validator -> explore_insights.
 *
 * Runs from the `explore` cron (twice a day) and the Regenerate button. With no
 * ANTHROPIC_API_KEY, or EXPLORE_ENABLED=false, or the monthly cap reached, it
 * records a `skipped` run (with the deterministic token snapshot) and makes no
 * model call. Calls Claude directly through the official SDK, never through the
 * engine's fallback provider chain, so "Claude wrote this" stays true.
 *
 * Server-only. The key is read from env inside this module and never logged.
 */

import { createHash } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { exploreConfig, costUsd, TTL_HOURS } from './config';
import { buildOursDigest, buildWorldDigest, buildSystemDigest } from './digest';
import { getSystemReport, getTokenSnapshot } from './system';
import { systemPrompt, outputSchema, userTurn } from './prompts';
import { validateCards } from './validate';
import type { Card, Digest, Drop, RawCard, Section } from './types';

export interface ExploreRunResult {
    ok: boolean;
    status: 'ok' | 'partial' | 'skipped' | 'error';
    runId: string | null;
    reason?: string;
    cards?: number;
    drops?: number;
    costUsd?: number;
}

/** Midnight in New York, as an ISO instant. */
function etMidnightIso(now = new Date()): string {
    const ymd = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    // Offset of New York at that moment (EST -05:00 / EDT -04:00).
    const tz = now.toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' });
    const m = tz.match(/GMT([+-]\d+)/);
    const off = m ? Number(m[1]) : -5;
    const sign = off < 0 ? '-' : '+';
    return new Date(`${ymd}T00:00:00${sign}${String(Math.abs(off)).padStart(2, '0')}:00`).toISOString();
}

export interface ManualGate {
    allowed: boolean;
    reason?: string;
    usedToday: number;
    limit: number;
    nextAt?: string;
}

/** Server-side Regenerate gate: per-day cap + cooldown since the last real run. */
export async function manualGate(): Promise<ManualGate> {
    const limit = exploreConfig.maxManualPerDay();
    const [{ count }, { data: last }] = await Promise.all([
        supabaseAdmin.from('explore_runs').select('id', { count: 'exact', head: true })
            .eq('trigger', 'manual').in('status', ['ok', 'partial', 'error', 'running']).gte('started_at', etMidnightIso()),
        supabaseAdmin.from('explore_runs').select('started_at').in('status', ['ok', 'partial', 'running'])
            .order('started_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const usedToday = count ?? 0;
    if (usedToday >= limit) return { allowed: false, reason: `Daily limit reached (${limit} refreshes)`, usedToday, limit };
    if (last?.started_at) {
        const next = Date.parse(last.started_at) + exploreConfig.cooldownMinutes() * 60_000;
        if (next > Date.now()) return { allowed: false, reason: 'Cooling down', usedToday, limit, nextAt: new Date(next).toISOString() };
    }
    return { allowed: true, usedToday, limit };
}

async function monthSpend(): Promise<number> {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const { data } = await supabaseAdmin.from('explore_runs').select('cost_usd').gte('started_at', start).limit(1000);
    return (data || []).reduce((s, r) => s + Number(r.cost_usd || 0), 0);
}

async function dismissedTitles(section: Section): Promise<string[]> {
    const { data } = await supabaseAdmin.from('explore_insights').select('title')
        .eq('section', section).eq('state', 'dismissed')
        .gte('state_at', new Date(Date.now() - 14 * 86_400_000).toISOString()).limit(30);
    return (data || []).map((r) => r.title as string);
}

interface SectionOutcome {
    section: Section;
    model: string;
    ok: boolean;
    cards: Card[];
    drops: Drop[];
    input: number;
    output: number;
    error?: string;
}

/** One structured-output call for one section. */
async function callSection(client: Anthropic, section: Section, digest: Digest, model: string): Promise<SectionOutcome> {
    const base = { section, model, cards: [] as Card[], drops: [] as Drop[], input: 0, output: 0 };
    // Haiku 4.5 predates adaptive thinking / effort; newer models get both.
    const light = model.startsWith('claude-haiku-4-5');
    try {
        const res = await client.messages.create({
            model,
            max_tokens: light ? 4000 : 16000,
            system: systemPrompt(section),
            messages: [{ role: 'user', content: userTurn(digest.facts, digest.refs) }],
            ...(light ? {} : { thinking: { type: 'adaptive' as const } }),
            output_config: {
                format: { type: 'json_schema', schema: outputSchema(section) as unknown as Record<string, unknown> },
                ...(light ? {} : { effort: 'medium' as const }),
            },
        });
        const input = res.usage.input_tokens + (res.usage.cache_creation_input_tokens ?? 0) + (res.usage.cache_read_input_tokens ?? 0);
        const output = res.usage.output_tokens;
        if (res.stop_reason === 'refusal') return { ...base, ok: false, input, output, error: 'model refused' };
        if (res.stop_reason === 'max_tokens') return { ...base, ok: false, input, output, error: 'hit max_tokens' };
        const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
        let parsed: { cards?: RawCard[] };
        try {
            parsed = JSON.parse(text);
        } catch {
            return { ...base, ok: false, input, output, error: 'unparseable JSON' };
        }
        const { cards, drops } = validateCards(section, parsed.cards ?? [], digest);
        return { ...base, ok: true, cards, drops, input, output };
    } catch (e) {
        // Typed SDK errors carry a status; never include request bodies or headers.
        const msg = e instanceof Anthropic.APIError ? `API ${e.status ?? ''} ${e.name}`.trim() : (e as Error)?.name || 'error';
        return { ...base, ok: false, error: msg };
    }
}

export async function runExplore(opts: { trigger: 'cron' | 'manual' }): Promise<ExploreRunResult> {
    const { data: run, error: runErr } = await supabaseAdmin
        .from('explore_runs').insert({ trigger: opts.trigger, status: 'running' }).select('id').single();
    if (runErr || !run) return { ok: false, status: 'error', runId: null, reason: `could not open run row: ${runErr?.message}` };
    const runId = run.id as string;
    const finish = (patch: Record<string, unknown>) =>
        supabaseAdmin.from('explore_runs').update({ finished_at: new Date().toISOString(), ...patch }).eq('id', runId);

    // Deterministic token facts are captured on every run, key or no key.
    const snapshot = await getTokenSnapshot().catch(() => null);

    const skip = async (reason: string): Promise<ExploreRunResult> => {
        await finish({ status: 'skipped', skip_reason: reason, system_snapshot: snapshot });
        return { ok: true, status: 'skipped', runId, reason };
    };
    if (!exploreConfig.enabled()) return skip('EXPLORE_ENABLED=false');
    if (!exploreConfig.hasKey()) return skip('ANTHROPIC_API_KEY not set');
    const spent = await monthSpend();
    if (spent >= exploreConfig.monthlyCapUsd()) return skip(`monthly cap reached ($${spent.toFixed(2)} of $${exploreConfig.monthlyCapUsd()})`);

    try {
        const [oursD, worldD, report] = await Promise.all([
            dismissedTitles('ours').then(buildOursDigest),
            dismissedTitles('world').then(buildWorldDigest),
            getSystemReport(),
        ]);
        const systemD = buildSystemDigest(report);
        const digests: Digest[] = [worldD, oursD, systemD];
        const digestHash = createHash('sha256').update(JSON.stringify(digests.map((d) => d.facts))).digest('hex').slice(0, 16);

        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 150_000, maxRetries: 1 });
        // Our numbers moved to the main model 2026-10-09: Haiku's cards kept failing the source check.
        const modelFor: Record<Section, string> = { world: exploreConfig.model(), ours: exploreConfig.model(), system: exploreConfig.lightModel() };
        const attempted = digests.filter((d) => d.hasData);
        const outcomes = await Promise.all(attempted.map((d) => callSection(client, d.section, d, modelFor[d.section])));

        const now = Date.now();
        const okSections = outcomes.filter((o) => o.ok).map((o) => o.section);
        const cards = outcomes.flatMap((o) => o.cards);
        // A fresh read replaces the previous one for every section that succeeded.
        if (okSections.length) {
            await supabaseAdmin.from('explore_insights').update({ expires_at: new Date(now).toISOString() })
                .in('section', okSections).eq('state', 'new').gt('expires_at', new Date(now).toISOString());
        }
        if (cards.length) {
            const rows = cards.map((c) => ({
                run_id: runId, section: c.section, type: c.type, kind: c.kind, title: c.title, why: c.why,
                details: c.details, recommendation: c.recommendation, sources: c.sources, anime: c.anime,
                confidence: c.confidence, rank: c.rank,
                expires_at: new Date(now + (TTL_HOURS[c.section] ?? 48) * 3600_000).toISOString(),
            }));
            const { error } = await supabaseAdmin.from('explore_insights').insert(rows);
            if (error) throw new Error(`insert insights: ${error.message}`);
        }

        const input = outcomes.reduce((s, o) => s + o.input, 0);
        const output = outcomes.reduce((s, o) => s + o.output, 0);
        const cost = outcomes.reduce((s, o) => s + costUsd(o.model, o.input, o.output), 0);
        const failures = outcomes.filter((o) => !o.ok).map((o) => `${o.section}: ${o.error}`);
        const status = attempted.length === 0 ? 'ok' : failures.length === 0 ? 'ok' : okSections.length ? 'partial' : 'error';
        const drops = outcomes.flatMap((o) => o.drops);
        await finish({
            status,
            models: modelFor,
            input_tokens: input,
            output_tokens: output,
            cost_usd: Math.round(cost * 10000) / 10000,
            cards_kept: cards.length,
            drops,
            digest_hash: digestHash,
            digest_stats: Object.fromEntries(digests.map((d) => [d.section, { refs: Object.keys(d.refs).length, missing: d.missing, hasData: d.hasData }])),
            system_snapshot: snapshot,
            error: failures.length ? failures.join('; ') : null,
        });
        return { ok: status !== 'error', status, runId, cards: cards.length, drops: drops.length, costUsd: cost, reason: failures.join('; ') || undefined };
    } catch (e: any) {
        await finish({ status: 'error', error: String(e?.message || e).slice(0, 300), system_snapshot: snapshot });
        return { ok: false, status: 'error', runId, reason: String(e?.message || e) };
    }
}
