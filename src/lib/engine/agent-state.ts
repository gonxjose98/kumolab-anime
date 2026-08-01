// agent-state.ts
//
// The complete, machine-readable picture of KumoLab for an AI agent.
//
// The blueprint graph tells an agent what the system IS. That is not enough to
// make a decision. To answer "should this post go in the 13:00 slot?" an agent
// also needs the RULES the engine runs on (the formula, the score model, the
// approval matrix, the caps) and the CONTENT currently moving through it
// (pending review, standby pool, booked slots, what just went out).
//
// So this module assembles four things:
//   graph   — what the system is            (blueprint.ts)
//   rules   — what it decides by            (config modules, read live)
//   content — what is in it right now       (posts)
//   status  — how it is doing               (worker_runs, health, faults)
//
// Every rule is READ FROM THE MODULE THAT ENFORCES IT rather than restated
// here. If a cap changes in automation-config.ts, this contract changes with
// it. A restated rule is a rule that will eventually lie.
//
// NEVER add secrets, tokens, customer or order data. Node definitions carry env
// var NAMES on purpose (the name is documentation); values must never appear.

import { supabaseAdmin } from '@/lib/supabase/admin';
import { BLUEPRINT } from './blueprint';
import { getRecentRuns } from './worker-runs';
import { getFaults, type Fault } from './faults';
import {
    getPostFormula, getPeakSlots, getProjectGoals,
    type FormulaElement, type PeakSlot,
} from './engine-config';
import { getAnimeTiers } from './anime-tiers';
import {
    AUTOMATION, CLAIM_RISK_BY_TIER, PLATFORM_DAILY_CAP, PLATFORM_PEAK_WINDOWS,
    DIVERSITY, BREAKING_MAX_AGE_MINUTES, PREMIUM_PUBLISH_STUDIOS,
} from './automation-config';
import {
    SCORE_AUTO_PUBLISH_MIN, SCORE_REVIEW_MIN, STANDBY_MAX_AGE_HOURS, STANDBY_POOL_SIZE,
    QUALITY_MIN_HEIGHT, QUALITY_MIN_BITRATE, QUALITY_FULL_HEIGHT, QUALITY_FULL_BITRATE,
    GATES,
} from './scoring';
import {
    OFF_TOPIC_KEYWORDS, CONTENT_RULES, RSS_SOURCES, YOUTUBE_STUDIO_CHANNELS,
} from './sources-config';

/** Bump when a consumer would need to change. Agents can detect a break. */
export const CONTRACT_VERSION = 1;

export interface PostLite {
    id: string;
    title: string;
    claim_type: string | null;
    post_score: number | null;
    scheduled_post_time?: string | null;
    published_at?: string | null;
    source?: string | null;
}

export interface AgentState {
    contract: number;
    generatedAt: string;
    /** Written for a newly-connected agent: read this first. */
    readme: string;
    graph: typeof BLUEPRINT;
    rules: ReturnType<typeof buildRules> extends Promise<infer T> ? T : never;
    content: {
        pending: PostLite[];
        standby: PostLite[];
        scheduled: PostLite[];
        publishedLast24h: PostLite[];
        counts: Record<string, number>;
    };
    status: {
        runs: Awaited<ReturnType<typeof getRecentRuns>>;
        health: { checks: unknown[]; overall: string | null; checkedAt: string | null; ageMinutes: number | null };
        faults: Fault[];
        agents: unknown[];
    };
    tiers: Awaited<ReturnType<typeof getAnimeTiers>>;
    slots: PeakSlot[];
}

const README = [
    'KumoLab publishes anime news. This document is the whole system in one call.',
    '',
    'READ IN THIS ORDER: rules.formula (what a good post is) → rules.scoring (how',
    'it is graded out of 100) → rules.approval (what publishes automatically vs',
    'needs a human) → content (what is moving right now) → status (what is broken).',
    '',
    'THE SELECTION MODEL: exactly 3 Instagram posts a day, one per peak slot.',
    'Approved posts do NOT claim a slot on arrival — they join a standby pool',
    '(content.standby, scheduled_post_time = NULL). When a slot comes due the',
    'highest CURRENT-scoring pooled candidate wins it. Scores are re-computed at',
    'selection time, so an aging candidate decays and a strong one can wait a day',
    'and still win.',
    '',
    'THE TRAP: scheduled_post_time = NULL is not "unscheduled", it IS pool',
    'membership. A pooled post is exposed to the pruner, which demotes it to',
    "status='pending' once it is over 48h old, scores under 55, or falls beyond",
    'STANDBY_POOL_SIZE. Never write NULL to reschedule something — you can',
    'silently unapprove a post that was already going out.',
    '',
    'HOW THIS SYSTEM FAILS: not by throwing, but by going stale. A hand-curated',
    'list nobody refreshed once took auto-publishing to zero for two days with no',
    'error anywhere. Treat status.faults and freshness warnings as real.',
].join('\n');

async function buildRules() {
    const [formula, goals, slots] = await Promise.all([
        getPostFormula(),
        getProjectGoals(),
        getPeakSlots(),
    ]);

    return {
        /** The human-authored spec a winning post follows. Editable in engine_config. */
        formula: formula as FormulaElement[],
        /** KumoLab's project goals — distinct from the umbrella business goals. */
        goals: goals as FormulaElement[],

        /** The 3 peak posting slots, ET 24h. Editable by the operator. */
        peakSlots: slots,

        scoring: {
            outOf: 100,
            autoPublishMin: SCORE_AUTO_PUBLISH_MIN,
            reviewMin: SCORE_REVIEW_MIN,
            note: 'Scored at creation and RE-SCORED at slot selection. Recency decays, so a score is only meaningful with its timestamp.',
            components: [
                { label: 'Franchise / tier', max: 40, from: 'anime_tiers, else AniList popularity fallback' },
                { label: 'Video quality', max: 25, from: 'measured height + bitrate + real motion' },
                { label: 'Category', max: 20, from: 'claim type — trailer 20, season 17, date 12, key visual 6, cast/staff 3' },
                { label: 'Format', max: 8, from: 'real video > fake motion > static image' },
                { label: 'Recency', max: 7, from: 'age since detection' },
            ],
            quality: {
                minHeight: QUALITY_MIN_HEIGHT,
                minBitrate: QUALITY_MIN_BITRATE,
                fullHeight: QUALITY_FULL_HEIGHT,
                fullBitrate: QUALITY_FULL_BITRATE,
                note: 'Below the minimums is a HARD REJECT at fetch time, not a score penalty.',
            },
            hardGates: Object.values(GATES),
            standby: {
                maxAgeHours: STANDBY_MAX_AGE_HOURS,
                poolSize: STANDBY_POOL_SIZE,
                note: 'Past maxAgeHours, below reviewMin, or beyond poolSize -> demoted back to pending.',
            },
        },

        approval: {
            note: 'Claim type crossed with source tier decides the route. AUTO publishes without a human; CORROBORATE needs N independent sources; REVIEW always waits for a person; REJECT never publishes.',
            matrix: CLAIM_RISK_BY_TIER,
            corroboration: {
                windowHours: AUTOMATION.CORROBORATION_WINDOW_HOURS,
                minSources: AUTOMATION.CORROBORATION_MIN_SOURCES,
            },
            circuitBreaker: {
                corrections: AUTOMATION.CIRCUIT_BREAKER_THRESHOLD,
                windowHours: AUTOMATION.CIRCUIT_BREAKER_WINDOW_HOURS,
                note: 'That many corrections in the window pauses auto-publish entirely.',
            },
            textPostDailyCap: AUTOMATION.TEXT_POST_DAILY_CAP,
            breakingMaxAgeMinutes: BREAKING_MAX_AGE_MINUTES,
        },

        platforms: {
            dailyCap: PLATFORM_DAILY_CAP,
            peakWindowsEt: PLATFORM_PEAK_WINDOWS,
            diversity: DIVERSITY,
            premiumStudios: PREMIUM_PUBLISH_STUDIOS,
            note: "'instagram' represents the WHOLE Meta surface — Meta Suite cross-posts IG to Facebook and Threads automatically, so never publish to those directly or you duplicate the post.",
        },

        contentPolicy: {
            note: 'KumoLab posts ANIME. Live action, games, reviews and reaction content are rejected at ingestion, before they can become candidates.',
            offTopicKeywords: OFF_TOPIC_KEYWORDS,
            negativeKeywords: CONTENT_RULES.NEGATIVE_KEYWORDS,
            positiveKeywords: CONTENT_RULES.POSITIVE_KEYWORDS,
            keywordTrap: 'These lists are matched as SUBSTRINGS in several places, so "gacha", "switch" and "game" are deliberately NOT blockable — each appears in a real anime title (Gacha Girls Corps, Sukima Switch, No Game No Life).',
            sources: {
                rssFeeds: [...RSS_SOURCES.TIER_1, ...RSS_SOURCES.TIER_2, ...RSS_SOURCES.TIER_3],
                youtubeChannels: YOUTUBE_STUDIO_CHANNELS.TIER_1,
            },
        },
    };
}

const POST_COLS = 'id, title, claim_type, post_score, scheduled_post_time, published_at, source';

async function readContent() {
    const nowIso = new Date().toISOString();
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const [pending, approved, published] = await Promise.all([
        supabaseAdmin.from('posts').select(POST_COLS)
            .eq('status', 'pending').order('post_score', { ascending: false, nullsFirst: false }).limit(60),
        supabaseAdmin.from('posts').select(POST_COLS)
            .eq('status', 'approved')
            .or(`scheduled_post_time.gte.${nowIso},scheduled_post_time.is.null`)
            .limit(80),
        supabaseAdmin.from('posts').select(POST_COLS)
            .eq('status', 'published').gte('published_at', dayAgo)
            .order('published_at', { ascending: false }).limit(40),
    ]);

    const approvedRows = (approved.data ?? []) as PostLite[];
    // The split that matters: a booked slot vs the pool competing for one.
    const scheduled = approvedRows
        .filter((p) => p.scheduled_post_time)
        .sort((a, b) => String(a.scheduled_post_time).localeCompare(String(b.scheduled_post_time)));
    const standby = approvedRows
        .filter((p) => !p.scheduled_post_time)
        .sort((a, b) => (b.post_score ?? 0) - (a.post_score ?? 0));

    const pendingRows = (pending.data ?? []) as PostLite[];
    const publishedRows = (published.data ?? []) as PostLite[];

    return {
        pending: pendingRows,
        standby,
        scheduled,
        publishedLast24h: publishedRows,
        counts: {
            pending: pendingRows.length,
            standby: standby.length,
            scheduled: scheduled.length,
            publishedLast24h: publishedRows.length,
        },
    };
}

async function readHealth() {
    try {
        const { data } = await supabaseAdmin
            .from('engine_config').select('value, updated_at').eq('key', 'health_snapshot').maybeSingle();
        const snap = data?.value as { checks?: unknown[]; overall?: string; checkedAt?: string } | undefined;
        if (!snap) return { checks: [], overall: null, checkedAt: null, ageMinutes: null };
        // updated_at has no auto-trigger, so fall back to the snapshot's own
        // stamp rather than reporting a confidently wrong age.
        const stamp = data?.updated_at ?? snap.checkedAt ?? null;
        return {
            checks: snap.checks ?? [],
            overall: snap.overall ?? null,
            checkedAt: snap.checkedAt ?? null,
            ageMinutes: stamp ? Math.floor((Date.now() - new Date(stamp).getTime()) / 60000) : null,
        };
    } catch {
        return { checks: [], overall: null, checkedAt: null, ageMinutes: null };
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

/** The whole system, in one object. */
export async function getAgentState(): Promise<AgentState> {
    const [rules, content, runs, faultState, health, agents, tiers, slots] = await Promise.all([
        buildRules(),
        readContent().catch(() => ({
            pending: [], standby: [], scheduled: [], publishedLast24h: [],
            counts: { pending: 0, standby: 0, scheduled: 0, publishedLast24h: 0 },
        })),
        getRecentRuns().catch(() => []),
        getFaults().catch(() => ({ faults: [] as Fault[], healthAgeMinutes: null })),
        readHealth(),
        readAgents(),
        getAnimeTiers().catch(() => []),
        getPeakSlots(),
    ]);

    return {
        contract: CONTRACT_VERSION,
        generatedAt: new Date().toISOString(),
        readme: README,
        graph: BLUEPRINT,
        rules,
        content,
        status: { runs, health, faults: faultState.faults, agents },
        tiers,
        slots,
    } as AgentState;
}
