/**
 * blueprint.ts — the KumoLab system graph.
 *
 * ONE declarative map of the whole pipeline: where content is scraped from,
 * which workers fire and when, what they feed, which third parties and APIs are
 * involved, and where posts end up.
 *
 * This file is the single source of truth for three consumers:
 *   1. The blueprint canvas (/admin/engine) renders it.
 *   2. GET /api/admin/engine/state serves it to connected AI agents.
 *   3. The architecture brief is generated from it.
 *
 * That is the whole point. A hand-drawn diagram that disagrees with the code is
 * worse than no diagram, because an agent will trust it. Everything derivable
 * is DERIVED here (sources come from sources-config, worker schedules are
 * asserted against the cron manifest) rather than retyped, so the picture
 * cannot quietly drift from the system.
 *
 * This module must stay dependency-light and browser-safe: it is imported by
 * client components. Do not import supabaseAdmin or anything that reaches it.
 */

import { RSS_SOURCES, YOUTUBE_STUDIO_CHANNELS } from './sources-config';

// ── Types ───────────────────────────────────────────────────────

export type NodeKind =
    | 'core'        // KumoLab itself
    | 'stage'       // a pipeline stage
    | 'worker'      // a cron-driven worker
    | 'source'      // where content is scraped from
    | 'external'    // a third-party API or service we depend on
    | 'store'       // a data store
    | 'surface';    // where posts are published

export interface BlueprintNode {
    id: string;
    kind: NodeKind;
    label: string;
    /** 0 = core, 1 = pipeline, 2 = sources + destinations, 3 = externals. */
    ring: 0 | 1 | 2 | 3;
    /** Edge targets, by node id. */
    feeds: string[];
    /** Source tier (1 = auto-publish worthy … 4 = validation only). */
    tier?: 1 | 2 | 3 | 4;
    /** Cron expression, for worker nodes. Mirrors vercel.json. */
    schedule?: string;
    /** Human reading of `schedule`. */
    cadence?: string;
    /** The `?worker=` key. Joins this node to worker_runs rows. */
    worker?: string;
    /** The health-monitor check key, if one covers this node. */
    healthKey?: string;
    /** error_logs.source values belonging to this node. Makes errors spatial. */
    errorSources?: string[];
    /** Env var that configures it, for externals. */
    env?: string;
    /**
     * Constellation key. Nodes sharing one are laid out as a cluster of
     * satellites rather than spread along an arc — seventeen individual dots on
     * a ring read as a list, whereas two labelled clusters read as structure.
     * Layout concern only; it has no effect on the graph itself.
     */
    group?: string;
    /** Written for an incoming AI agent: what this is, and how it fails. */
    doc: string;
}

export interface BlueprintEdge {
    from: string;
    to: string;
}

/**
 * THE ENTRY POINT.
 *
 * An agent (or a person) landing on this system cold needs to be told where to
 * start and in what order to read, or it will sample the map arbitrarily and
 * build a wrong model. A pile of well-documented nodes is not an explanation —
 * the ORDER is the explanation.
 *
 * This is the single ordered path through the system. It is rendered as the
 * core node's inspector on the canvas, and served as `entrypoint` in the agent
 * contract, so the human and the machine are handed the same tour.
 *
 * Each step names both the node to look at and the contract path to read, so an
 * agent can follow it without the UI.
 */
export const ENTRY_NODE_ID = 'core';

export interface OrientationStep {
    step: number;
    title: string;
    /** What to understand at this step, in one or two sentences. */
    what: string;
    /** The node on the map that embodies it. */
    nodeId?: string;
    /** Where to read it in the agent contract. */
    contractPath?: string;
}

export const ORIENTATION: OrientationStep[] = [
    {
        step: 1,
        title: 'What KumoLab is',
        what: 'An anime-news pipeline. It scrapes official sources, scores and de-duplicates what it finds, '
            + 'auto-approves whatever clears the bar, books posts into 3 peak slots a day, and publishes to '
            + 'social plus the website. Everything else on this map hangs off that loop.',
        nodeId: 'core',
        contractPath: 'readme',
    },
    {
        step: 2,
        title: 'What it is FOR',
        what: 'The project goals — revenue first, anime only, quality over volume. These are KumoLab\'s own '
            + 'goals and are deliberately different from the umbrella business goals. Read them before '
            + 'proposing any change, because most bad suggestions are locally sensible and strategically wrong.',
        contractPath: 'rules.goals',
    },
    {
        step: 3,
        title: 'What a good post looks like',
        what: 'The posting formula: known franchise, trailer or season news, real video, one of the peak '
            + 'slots, 2-3 a day. This is the spec any work on KumoLab should be checked against.',
        contractPath: 'rules.formula',
    },
    {
        step: 4,
        title: 'Where content comes from',
        what: '4 RSS feeds and 13 official YouTube channels, polled every 30 minutes. Off-topic material '
            + '(live action, games, reviews) is rejected at ingestion and never becomes a candidate.',
        nodeId: 'worker.detection',
        contractPath: 'rules.contentPolicy',
    },
    {
        step: 5,
        title: 'How a candidate is judged',
        what: 'Scored out of 100: franchise 40, video quality 25, category 20, format 8, recency 7. '
            + '75+ can auto-publish, under 55 is dropped. Crucially the score is RE-COMPUTED at slot '
            + 'selection, so it decays — a score only means something alongside its timestamp.',
        nodeId: 'stage.scoring',
        contractPath: 'rules.scoring',
    },
    {
        step: 6,
        title: 'What publishes without a human',
        what: 'Claim type crossed with source tier. Trailers and key visuals from tier-1/2 sources go out '
            + 'automatically; delays, cast and staff changes always need corroboration or a person, because '
            + 'those are the ones that damage the brand when wrong.',
        nodeId: 'stage.approval',
        contractPath: 'rules.approval',
    },
    {
        step: 7,
        title: 'How posting is scheduled',
        what: 'Exactly 3 Instagram posts a day, one per peak slot. Approved posts do NOT claim a slot on '
            + 'arrival — they wait in the standby pool and the highest CURRENT scorer wins each slot as it '
            + 'comes due. THE TRAP: scheduled_post_time = NULL is not "unscheduled", it IS pool membership, '
            + 'and the pruner can demote a pooled post back to pending. Never write NULL to reschedule.',
        nodeId: 'stage.standby',
        contractPath: 'content.standby',
    },
    {
        step: 8,
        title: 'How it actually goes out',
        what: 'The publisher fires twice an hour and selects purely on scheduled_post_time. Instagram '
            + 'represents the whole Meta surface — Meta Suite cross-posts to Facebook and Threads on its '
            + 'own, so publishing to those directly duplicates the post.',
        nodeId: 'worker.publish',
        contractPath: 'rules.platforms',
    },
    {
        step: 9,
        title: 'How to tell if it is broken',
        what: 'This system fails by going STALE, not by throwing. A hand-curated list nobody refreshed once '
            + 'took auto-publishing to zero for two days with no error anywhere. Read the faults — each one '
            + 'names the node that produced it and what to do about it.',
        nodeId: 'stage.faults',
        contractPath: 'status.faults',
    },
];

export interface Blueprint {
    nodes: BlueprintNode[];
    edges: BlueprintEdge[];
}

// ── Derived source nodes ────────────────────────────────────────
//
// Derived, not retyped, so adding a feed to sources-config.ts puts it on the
// map automatically.
//
// CAVEAT worth recording: dynamic-sources.ts can in principle override the
// source list from a scraper-config.json in Supabase Storage. It is NOT on the
// live detection path today — detection-worker.ts and fetchers.ts both import
// the static sources-config — so this derivation is accurate. If that module is
// ever wired in, this map silently becomes wrong.

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const rssNodes: BlueprintNode[] = [
    ...RSS_SOURCES.TIER_1,
    ...RSS_SOURCES.TIER_2,
    ...RSS_SOURCES.TIER_3,
].map((s) => ({
    id: `rss.${slug(s.name)}`,
    kind: 'source' as const,
    label: s.name,
    ring: 2 as const,
    tier: s.tier as 1 | 2 | 3 | 4,
    group: 'rss',
    feeds: ['worker.detection'],
    errorSources: ['detection-worker', 'fetchers'],
    doc: `RSS feed (${s.url}), source tier ${s.tier}. Polled by the detection worker every 30 minutes. `
        + (('keywordFiltered' in s && s.keywordFiltered)
            ? 'Keyword-filtered: only items matching CONTENT_RULES.KEYWORD_FILTER_REQUIRED are admitted, because this feed carries a lot of non-anime news.'
            : 'Items are filtered by the positive/negative keyword rules in sources-config.'),
}));

const youtubeNodes: BlueprintNode[] = [
    ...YOUTUBE_STUDIO_CHANNELS.TIER_1,
    ...YOUTUBE_STUDIO_CHANNELS.TIER_2,
    ...YOUTUBE_STUDIO_CHANNELS.TIER_3,
    ...YOUTUBE_STUDIO_CHANNELS.TIER_4,
].map((c) => ({
    id: `yt.${slug(c.name)}`,
    kind: 'source' as const,
    label: c.name,
    ring: 2 as const,
    tier: c.tier as 1 | 2 | 3 | 4,
    group: 'youtube',
    feeds: ['worker.detection'],
    errorSources: ['detection-worker', 'fetchers'],
    doc: `Official YouTube channel (${c.channelId}), read via the free RSS feed — no API quota. Tier ${c.tier}: `
        + 'a studio uploading a trailer to its own channel is evidence by existence, so T1 YouTube candidates '
        + 'scoring >= 7 take the auto-publish shortcut in auto-approval.ts without corroboration.',
}));

// ── The graph ───────────────────────────────────────────────────

const CORE_AND_PIPELINE: BlueprintNode[] = [
    {
        id: 'core',
        kind: 'core',
        label: 'KumoLab',
        ring: 0,
        feeds: [],
        doc: 'START HERE. This is the entry point to the whole system — if you are an agent picking up '
            + 'KumoLab for the first time, read the 9-step orientation below IN ORDER before touching '
            + 'anything else. The order is the explanation; the nodes on their own are just parts. '
            + 'KumoLab is an anime-news pipeline: it scrapes official sources, scores and de-duplicates '
            + 'candidates, auto-approves what clears the bar, books posts into 3 peak slots a day, and '
            + 'publishes to social plus the website. Everything on this map hangs off that loop.',
    },

    // ── Workers (ring 1) ──
    {
        id: 'worker.detection',
        kind: 'worker',
        label: 'Detection',
        ring: 1,
        schedule: '*/30 * * * *',
        cadence: 'Every 30 minutes',
        worker: 'detection',
        healthKey: 'cron',
        errorSources: ['detection-worker', 'fetchers'],
        feeds: ['stage.candidates'],
        doc: 'Scans every RSS feed and YouTube channel for new items and writes candidates. '
            + 'Off-topic content (live action, games) is rejected here at ingestion, before it can ever '
            + 'become a candidate. If scraper_logs stops moving for 60+ minutes the Scraper health check warns; '
            + 'past 120 minutes it crits, which almost always means the Vercel cron itself is broken.',
    },
    {
        id: 'worker.processing',
        kind: 'worker',
        label: 'Processing',
        ring: 1,
        schedule: '0 * * * *',
        cadence: 'Hourly, on the hour',
        worker: 'processing',
        healthKey: 'cadence',
        errorSources: ['processing-worker'],
        feeds: ['stage.scoring'],
        doc: 'Turns candidates into posts: classifies the claim, scores it, checks for duplicates, '
            + 'runs AniList validation and corroboration, then either auto-approves into the standby pool '
            + 'or queues for manual review. Deliberately decoupled from publishing so a slow video upload '
            + 'cannot time out this request.',
    },
    {
        id: 'worker.publish',
        kind: 'worker',
        label: 'Publisher',
        ring: 1,
        schedule: '5,35 * * * *',
        cadence: 'Twice an hour, at :05 and :35',
        worker: 'publish',
        healthKey: 'cadence',
        errorSources: ['publisher', 'social-publisher'],
        feeds: ['surface.instagram', 'surface.x', 'surface.youtube', 'surface.tiktok', 'surface.website'],
        doc: 'Fills any peak slot coming due from the standby pool (highest CURRENT score wins), then '
            + 'publishes everything whose scheduled_post_time has passed. Idempotent per post: status flips '
            + 'to published up front and each post takes a publisher lock, so overlapping ticks cannot '
            + 'double-publish. THIS is the worker that honours a manual drag — it selects purely on '
            + 'scheduled_post_time.',
    },
    {
        id: 'worker.health',
        kind: 'worker',
        label: 'Health Monitor',
        ring: 1,
        schedule: '*/30 * * * *',
        cadence: 'Every 30 minutes',
        worker: 'health-monitor',
        errorSources: ['health-monitor.alert-undelivered'],
        feeds: ['stage.faults'],
        doc: 'Runs 11 subsystem checks and fires an alert on STATE TRANSITIONS only (so a persistent '
            + 'fault does not spam). Alerts go to HEALTH_ALERT_WEBHOOK if set, otherwise email via Resend. '
            + 'Known history: the webhook was never configured, so every check computed correctly and then '
            + 'reached nobody — which is how a stale tier list stalled publishing for two days unnoticed.',
    },
    {
        id: 'worker.cleanup',
        kind: 'worker',
        label: 'Cleanup',
        ring: 1,
        schedule: '0 3 * * *',
        cadence: 'Daily at 03:00 UTC',
        worker: 'cleanup',
        healthKey: 'storage',
        errorSources: ['cleanup-worker'],
        feeds: ['store.supabase'],
        doc: 'Retention sweep: expired posts, orphaned storage objects, and log TTLs via the '
            + 'cleanup_old_logs SQL function. Matters more than it looks — a bucket filling up restricted '
            + 'the entire project API in July 2026 and forced the org onto a paid plan. Note studio-library '
            + 'is never swept automatically and must be pruned by hand.',
    },
    {
        id: 'worker.tiers',
        kind: 'worker',
        label: 'Tier Refresh',
        ring: 1,
        schedule: '0 6 * * 3',
        cadence: 'Weekly, Wednesday 06:00 UTC',
        worker: 'refresh-tiers',
        healthKey: 'tier_list',
        errorSources: ['tier-refresh'],
        feeds: ['store.tiers'],
        doc: 'Tops up anime_tiers from AniList popularity. Exists because the list used to be entirely '
            + 'hand-maintained: as it aged, more posts missed it and scored 0/40 on Franchise, which took '
            + 'auto-publishing to zero on 2026-07-29. Manual entries are never overwritten.',
    },
    {
        id: 'worker.drops',
        kind: 'worker',
        label: 'Daily Drops',
        ring: 1,
        schedule: '0 11 * * *',
        cadence: 'Daily at 11:00 UTC',
        worker: 'dailydrops',
        feeds: ['surface.website'],
        doc: "The day's airing-episode roundup from AniList. Website-only (type='DROP'), so these never "
            + 'consume an Instagram peak slot or count toward the 3/day cap.',
    },
    {
        id: 'worker.report',
        kind: 'worker',
        label: 'Daily Report',
        ring: 1,
        schedule: '0 4 * * *',
        cadence: 'Daily at 04:00 UTC',
        worker: 'daily-report',
        errorSources: ['daily-report', 'daily-report:token-health'],
        feeds: ['stage.faults'],
        doc: 'End-of-day pipeline summary: candidates accepted, posts published, average quality grade, '
            + 'and any issues worth surfacing.',
    },
    {
        id: 'worker.metrics',
        kind: 'worker',
        label: 'Metrics Sync',
        ring: 1,
        schedule: '40 */12 * * *',
        cadence: 'Twice daily at :40',
        worker: 'metrics-sync',
        feeds: ['external.meta'],
        doc: 'Pulls per-post Instagram insights into posts.social_metrics so the analytics Social column '
            + 'stays fresh without anyone pressing Sync. Rate-limit aware: stops cleanly if Meta throttles.',
    },
    {
        id: 'worker.snapshot',
        kind: 'worker',
        label: 'Monthly Snapshot',
        ring: 1,
        schedule: '30 0 1 * *',
        cadence: 'Monthly, 1st at 00:30 UTC',
        worker: 'monthly-snapshot',
        feeds: ['external.ga4', 'store.supabase'],
        doc: 'Captures the month that just ended into monthly_metrics, timed to beat Meta\'s ~30-day '
            + 'account-insight retention window.',
    },
    {
        id: 'worker.metatoken',
        kind: 'worker',
        label: 'Meta Token',
        ring: 1,
        schedule: '0 5 * * 1',
        cadence: 'Weekly, Monday 05:00 UTC',
        worker: 'refresh-meta-token',
        healthKey: 'meta_token',
        feeds: ['external.meta'],
        doc: 'Rotates the long-lived Meta token. When the data-access window closes, IG calls start '
            + 'returning empty data rather than failing loudly, so the health check warns at 30 days and '
            + 'crits under 7.',
    },
    {
        id: 'worker.threadstoken',
        kind: 'worker',
        label: 'Threads Token',
        ring: 1,
        schedule: '0 5 * * 2',
        cadence: 'Weekly, Tuesday 05:00 UTC',
        worker: 'refresh-threads-token',
        healthKey: 'threads_token',
        errorSources: ['threads-token.refresh'],
        feeds: ['external.meta'],
        doc: 'Rotates the Threads token, which dies 60 days after issue. There is no cheap Threads '
            + 'equivalent of Meta\'s debug_token, so health is inferred from whether ROTATION is succeeding '
            + 'rather than by probing the token.',
    },
    {
        id: 'worker.newsletter',
        kind: 'worker',
        label: 'Newsletter',
        ring: 1,
        schedule: '0 14 * * 0',
        cadence: 'Weekly, Sunday 14:00 UTC',
        worker: 'newsletter',
        feeds: ['external.resend'],
        doc: 'Composes The Forecast from the week\'s confirmed news. Sends a PREVIEW to the owner only '
            + 'unless NEWSLETTER_AUTO_SEND=true, so nothing reaches subscribers until the format is approved.',
    },

    // ── Pipeline stages (ring 1) ──
    {
        id: 'stage.candidates',
        kind: 'stage',
        label: 'Candidates',
        ring: 1,
        feeds: ['worker.processing'],
        errorSources: ['detection-worker'],
        doc: 'Raw items detected but not yet judged. Off-topic content never reaches here — live action '
            + 'and games are rejected at ingestion. Note the keyword lists are deliberately conservative: '
            + '"gacha", "switch" and "game" are NOT blockable because they appear in real anime titles.',
    },
    {
        id: 'stage.scoring',
        kind: 'stage',
        label: 'Scoring',
        ring: 1,
        feeds: ['stage.approval'],
        errorSources: ['scoring', 'content-grader'],
        doc: 'Scores a candidate out of 100 (franchise/tier 40, category, format, recency) and applies '
            + 'hard gates. The score is re-computed at slot-selection time, not frozen at approval, so an '
            + 'aging standby candidate decays and a big Tier-1 trailer can wait a day and still win its slot.',
    },
    {
        id: 'stage.approval',
        kind: 'stage',
        label: 'Approval',
        ring: 1,
        feeds: ['stage.standby'],
        errorSources: ['auto-approval', 'corroboration'],
        doc: 'Decides AUTO / CORROBORATE / REVIEW / REJECT from the claim-type risk matrix crossed with '
            + 'source tier. Trailers and key visuals auto-publish at T1/T2; delays, cast and staff changes '
            + 'always need corroboration or a human, because those are the brand-damaging ones to get wrong.',
    },
    {
        id: 'stage.standby',
        kind: 'stage',
        label: 'Standby Pool',
        ring: 1,
        feeds: ['stage.slots'],
        doc: 'Approved posts with NO slot yet (scheduled_post_time IS NULL). CRITICAL for anything '
            + 'touching the schedule: NULL is not an empty value here, it IS pool membership. A post left in '
            + 'the pool is exposed to the pruner, which demotes it back to pending if it is over 48h old, '
            + 'scored under 55, or beyond STANDBY_POOL_SIZE. Never write NULL to reschedule something.',
    },
    {
        id: 'stage.slots',
        kind: 'stage',
        label: 'Peak Slots',
        ring: 1,
        feeds: ['worker.publish'],
        doc: 'Exactly 3 Instagram posts a day, one per operator-editable peak slot (default 07:30 / '
            + '13:00 / 21:30 ET). Each slot is filled from the pool when it comes due, by highest current '
            + 'score. Slot times are DST-safe: ET instants are found by walking UTC hours against the '
            + 'US-Eastern DST rules, never a hardcoded offset. FB-only key visuals run on a separate '
            + 'off-peak grid and never consume these slots.',
    },
    {
        id: 'stage.faults',
        kind: 'stage',
        label: 'Diagnostics',
        ring: 1,
        feeds: [],
        errorSources: ['health-monitor.alert-undelivered'],
        doc: 'The merged fault surface: 11 health checks, the last 24h of error_logs grouped by source, '
            + 'and retry-exhausted stuck posts. Every fault carries the node it came from, so an agent can '
            + 'say WHERE the system broke rather than only that it did.',
    },
];

const SURFACES: BlueprintNode[] = [
    {
        id: 'surface.instagram',
        kind: 'surface',
        label: 'Instagram',
        ring: 2,
        feeds: ['external.meta'],
        healthKey: 'meta_token',
        doc: 'Represents the WHOLE Meta surface. Meta Suite cross-posts IG to Facebook and Threads '
            + 'automatically, so the publisher must never fan out to FB or Threads directly — that would '
            + 'duplicate the cross-post. Capped at exactly 3 a day.',
    },
    {
        id: 'surface.x', kind: 'surface', label: 'X', ring: 2, feeds: ['external.x'],
        doc: 'Text and link posts. No daily cap; active window 06:00-23:00 ET.',
    },
    {
        id: 'surface.youtube', kind: 'surface', label: 'YouTube', ring: 2, feeds: ['external.youtube'],
        doc: 'Shorts, EDITED VIDEOS ONLY — gated on post.image_settings.video_project plus '
            + 'YOUTUBE_AUTO_PUBLISH=true. Reposts and raw trailers must never reach YouTube. Uploads land '
            + 'private pending Google API audit.',
    },
    {
        id: 'surface.tiktok', kind: 'surface', label: 'TikTok', ring: 2, feeds: [],
        doc: 'MIRRORS INSTAGRAM — anything that successfully publishes to IG is queued for TikTok. No API '
            + '(three dev-app rejections), so the publisher only writes a tiktok_queue row; the actual post '
            + 'is made by scripts/tiktok/tt-runner.mjs on Jose\'s PC under Task Scheduler, driving the real '
            + 'TikTok Studio upload with Playwright. Gated on TIKTOK_QUEUE_ENABLED=true. If the PC is off or '
            + 'the saved login session expires, jobs simply wait in the queue.',
    },
    {
        id: 'surface.website', kind: 'surface', label: 'kumolabanime.com', ring: 2, feeds: ['external.vercel'],
        doc: 'The public site. Articles are server-rendered with per-article OG images. No cap.',
    },
];

const EXTERNALS: BlueprintNode[] = [
    {
        id: 'external.anilist', kind: 'external', label: 'AniList', ring: 3, tier: 4, feeds: [],
        doc: 'Validation and popularity only, never a content source. Confirms an anime exists and '
            + 'supplies the popularity fallback when a title is missing from the curated tier list.',
    },
    {
        id: 'external.youtube', kind: 'external', label: 'YouTube Data API', ring: 3, feeds: [],
        env: 'YOUTUBE_API_KEY', errorSources: ['youtube-upload'],
        doc: 'Used for uploads and channel lookups. Channel MONITORING uses free RSS instead, so it costs '
            + 'no quota. OPEN ACTION: a hardcoded key in custom-url/route.ts still needs rotating.',
    },
    {
        id: 'external.meta', kind: 'external', label: 'Meta Graph', ring: 3, feeds: [],
        env: 'META_ACCESS_TOKEN', healthKey: 'meta_token', errorSources: ['meta-graph', 'social-publisher'],
        doc: 'Instagram publishing plus insights. The most fragile external dependency: tokens expire on '
            + 'a rolling window and failures are quiet (empty data, not errors).',
    },
    {
        id: 'external.x', kind: 'external', label: 'X API', ring: 3, feeds: [], env: 'X_API_KEY',
        errorSources: ['x-publisher'],
        doc: 'Posting only — X is never read as a content source. Uncapped and low-stakes compared with '
            + 'the Meta surface: a failed X post is logged and does not block the rest of a broadcast, so '
            + 'failures here are easy to miss. Check error_logs rather than expecting a health alert.',
    },
    {
        id: 'external.worker', kind: 'external', label: 'yt-dlp Worker', ring: 3, feeds: [],
        env: 'YT_WORKER_URL', healthKey: 'worker',
        doc: 'A Render-hosted service that downloads trailer video. Sleeps after 15 minutes idle and takes '
            + '30-60s to wake, which is why its health check allows a 60-second timeout. A rotating proxy is '
            + 'MANDATORY (YouTube bot wall) and the plan bandwidth cap is the live constraint.',
    },
    {
        id: 'external.openai', kind: 'external', label: 'OpenAI', ring: 3, feeds: [],
        env: 'OPENAI_API_KEY', errorSources: ['ai', 'generator'],
        doc: 'Caption and copy generation, plus Whisper for Studio karaoke captions.',
    },
    {
        id: 'external.stripe', kind: 'external', label: 'Stripe', ring: 3, feeds: [],
        env: 'STRIPE_SECRET_KEY', healthKey: 'store',
        doc: 'Live merch payments. Orders are drafted on payment and require MANUAL approval before '
            + 'Printful is charged. A missing key fails every checkout silently until someone tries to buy.',
    },
    {
        id: 'external.printful', kind: 'external', label: 'Printful', ring: 3, feeds: [],
        env: 'PRINTFUL_ACCESS_TOKEN', healthKey: 'store',
        doc: 'Merch fulfilment and live per-country shipping quotes at checkout. Printful product prices '
            + 'MUST be product-only or shipping is double-charged.',
    },
    {
        id: 'external.resend', kind: 'external', label: 'Resend', ring: 3, feeds: [],
        env: 'RESEND_API_KEY',
        doc: 'Newsletter and health alerts from news@kumolabanime.com (domain verified). Also the fallback '
            + 'channel for health alerts when no webhook is configured.',
    },
    {
        id: 'external.ga4', kind: 'external', label: 'GA4', ring: 3, feeds: [],
        doc: 'Website analytics via the Data API. Service-account key lives in Supabase app_secrets.',
    },
    {
        id: 'external.vercel', kind: 'external', label: 'Vercel', ring: 3, feeds: [],
        healthKey: 'cron',
        doc: 'Hosting plus the cron scheduler that fires every worker on this map. If crons stop, the '
            + 'entire pipeline stops silently — which is exactly what the Scraper freshness check watches for.',
    },
];

const STORES: BlueprintNode[] = [
    {
        id: 'store.supabase', kind: 'store', label: 'Supabase', ring: 3, feeds: [],
        healthKey: 'storage', errorSources: ['supabase'],
        doc: 'Postgres plus object storage. Storage is the historical failure mode: a full bucket '
            + 'restricted the whole project API in July 2026. Now on Pro (100 GB); the health check warns at '
            + '8 GB and crits at 12 GB, long before billing bites.',
    },
    {
        id: 'store.tiers', kind: 'store', label: 'Anime Tiers', ring: 3, feeds: ['stage.scoring'],
        healthKey: 'tier_list',
        doc: 'The curated priority list driving 40 of the 100 score points. Tier 1 = cover every beat, '
            + 'Tier 2 = added reach, Tier 3 = opportunistic. Editable by hand on this page and topped up '
            + 'weekly. THE canonical example of silent decay in this system: it goes stale, scores fall, and '
            + 'publishing quietly stops without anything erroring.',
    },
];

// ── Assembly ────────────────────────────────────────────────────

const ALL_NODES: BlueprintNode[] = [
    ...CORE_AND_PIPELINE,
    ...rssNodes,
    ...youtubeNodes,
    ...SURFACES,
    ...EXTERNALS,
    ...STORES,
];

/** Edges, derived from every node's `feeds`. Dangling targets are dropped. */
function buildEdges(nodes: BlueprintNode[]): BlueprintEdge[] {
    const ids = new Set(nodes.map((n) => n.id));
    const edges: BlueprintEdge[] = [];
    for (const n of nodes) {
        for (const to of n.feeds) {
            if (ids.has(to)) edges.push({ from: n.id, to });
        }
    }
    return edges;
}

export const BLUEPRINT: Blueprint = {
    nodes: ALL_NODES,
    edges: buildEdges(ALL_NODES),
};

// ── Lookups ─────────────────────────────────────────────────────

export const NODES_BY_ID: Record<string, BlueprintNode> =
    Object.fromEntries(ALL_NODES.map((n) => [n.id, n]));

/** Every node with telemetry, keyed by its `?worker=` string. */
export const NODE_BY_WORKER: Record<string, BlueprintNode> =
    Object.fromEntries(ALL_NODES.filter((n) => n.worker).map((n) => [n.worker!, n]));

/**
 * Resolve an error_logs.source to the node that produced it. This is the join
 * that makes faults spatial — without it an error is just a string, and neither
 * Jose nor an agent can see WHERE the system broke.
 *
 * Prefix-matched, because sources are dotted and hierarchical
 * ("threads-token.refresh", "daily-report:token-health").
 */
export function nodeForErrorSource(source: string | null | undefined): BlueprintNode | null {
    if (!source) return null;
    const s = source.toLowerCase();
    let best: BlueprintNode | null = null;
    let bestLen = 0;
    for (const n of ALL_NODES) {
        for (const es of n.errorSources || []) {
            const k = es.toLowerCase();
            if ((s === k || s.startsWith(k)) && k.length > bestLen) {
                best = n;
                bestLen = k.length;
            }
        }
    }
    return best;
}

/** Resolve a health-monitor check key to its node. */
export function nodeForHealthKey(key: string | null | undefined): BlueprintNode | null {
    if (!key) return null;
    return ALL_NODES.find((n) => n.healthKey === key) ?? null;
}

/**
 * The worker keys the cron route dispatches. Asserted against this list in
 * tests so a renamed worker cannot silently unhook its telemetry from the map.
 */
export const CRON_WORKER_KEYS = [
    'detection', 'processing', 'publish', 'dailydrops', 'daily-report', 'cleanup',
    'render', 'refresh-meta-token', 'refresh-threads-token', 'republish-social',
    'metrics-sync', 'monthly-snapshot', 'health-monitor', 'newsletter', 'refresh-tiers',
] as const;
