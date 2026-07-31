# Engine Blueprint — design

**Date:** 2026-07-31
**Status:** approved (design), pending implementation plan
**Replaces:** `/admin/engine` (FormulaPanel + PeakSlots + ScheduledFeed + EngineTiers)

---

## 1. Purpose

The Engine tab today is four stacked cards. `FormulaPanel` is static text and
`ScheduledFeed` is a read-only table; `PeakSlots` and `EngineTiers` are
genuinely interactive and their behaviour is preserved. The tab describes the
pipeline; it does not show it running.

This redesign turns the tab into a live, interactive map of the whole KumoLab
system — every source, worker, API, third party and destination, animated by
real telemetry — that serves two readers at once:

- **Jose**, who needs to see at a glance what is running, what is scheduled,
  what is broken, and to reach in and change the schedule and the tiers.
- **Any AI agent** connected to KumoLab (this Claude Code session, or an
  external agent over the API), which needs a machine-readable map of the
  system, its current state, and its current faults — precise enough to
  diagnose an error and eventually to schedule posts when auto-approve volume
  is low.

The design property that serves both: **the diagram is data.** One declarative
graph file is rendered by the canvas and served by the state API, so the
picture an agent reads and the picture Jose sees cannot drift apart.

### Non-goals

- Agents autonomously scheduling posts. This spec builds the *surface* an agent
  reads and the presence channel it announces itself on. Autonomous scheduling
  is a later project that consumes this one.
- Changing any pipeline behaviour. Scoring, approval, corroboration and
  publishing rules are untouched. The one write path added is rescheduling an
  already-approved post.
- Replacing Content → Schedule. The clock is a second, spatial view over the
  same `posts.scheduled_post_time` column.

---

## 2. Decisions taken

| Question | Decision |
|---|---|
| Palette | Always-dark holographic canvas in KumoLab gold + sea blue. This tab opts out of the light/dark toggle. |
| Idle motion | Always alive. Ambient drift and carrier particles at baseline; real cron fires surge above it. |
| Navigation | Cinematic focus. Click a node, camera flies to it, siblings recede, inspector opens, breadcrumb back. |
| Page layout | Canvas hero at full height; clock, diagnostics and tiers as full-width collapsible sections below. |
| Drag conflict | Swap. Two posts trade slots. |
| Brief popup | Architecture brief + posting formula + KumoLab project goals. Read-only. |

Everything is visible or one click from visible. Nothing is removed from the
page; the formula moves into a popup because it is reference material, not a
control.

---

## 3. Sub-projects

Built in this order. 0, 2 and 3 share no files and can run concurrently once
`blueprint.ts` exists.

| # | Sub-project | Depends on | Backend prerequisite |
|---|---|---|---|
| 0 | `worker_runs` telemetry | — | `worker_runs` table; `cleanup_old_logs` migration |
| 1 | Blueprint canvas | `blueprint.ts`, 0 | — |
| 2 | The clock | — | extract `et-time.ts`; `swap_post_slots` RPC |
| 3 | Diagnostics | — | health-monitor persists its snapshot |
| 4 | Agent layer | `blueprint.ts`, 0, 3 | `checkAdmin` bearer branch; `agent_sessions` table |

Each backend prerequisite is real work the first draft of this spec missed, and
each one is the difference between a feature that works and one that only
looks like it does. They are listed here so no sub-project starts by assuming
its foundation exists.

All of it ships behind `/admin/engine-blueprint`. `/admin/engine` keeps working
untouched until sign-off, then the route swaps and the old page is deleted.
This mirrors how the sea-to-sky redesign shipped.

---

## 4. Sub-project 0 — telemetry

### Problem

Cron-run telemetry exists but is too thin to drive this view.
`logSchedulerRun` (`src/lib/logging/scheduler.ts:6`) writes to `scheduler_logs`
with slot, status, message and a details JSON — but only from four workers
(detection, processing, cleanup, dailydrops) and with **no duration and no
structured result payload**. The other eleven workers in the cron dispatch
leave no trace at all. `scraper_logs` records per-candidate decisions, a side
effect of detection only; `error_logs` records failures.

So there is no row that says "the processing worker ran at 14:00, took 9
seconds, and accepted 3 candidates" for any worker, and nothing whatsoever for
publish, health-monitor, tier-refresh or the token rotations.

`worker_runs` covers all fifteen workers uniformly with duration and payload.
It **coexists with** `scheduler_logs` rather than replacing it —
`/api/admin/activity/route.ts:14` already reads `scheduler_logs` and is out of
scope here. Do not migrate or delete it in this project.

### Schema

```sql
create table worker_runs (
  id          uuid primary key default gen_random_uuid(),
  worker      text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  duration_ms integer,
  result      jsonb,
  error       text
);
create index worker_runs_worker_time on worker_runs (worker, started_at desc);
create index worker_runs_time on worker_runs (started_at desc);
```

`result` stores the worker's own return payload verbatim — the same object the
cron route already returns to Vercel. That payload is where the interesting
numbers live (`candidates`, `accepted`, `rejected`, `added`, `rotated`), so
storing it whole means the inspector can show real counts without any worker
being modified to report them.

### Instrumentation

A single wrapper in `src/lib/engine/worker-runs.ts`:

```ts
export async function withRun<T>(worker: string, fn: () => Promise<T>): Promise<T>
```

Applied once around the dispatch body of `/api/cron/route.ts` — inside the
existing `try` (line 46), and **without swallowing the catch at line 519**,
which must still return its 500 after the failure is recorded.

`worker_runs.worker` and `BlueprintNode.worker` both use the exact `?worker=`
query strings enumerated at `route.ts:516` (`detection`, `processing`,
`publish`, `dailydrops`, `daily-report`, `cleanup`, `render`,
`refresh-meta-token`, `refresh-threads-token`, `republish-social`,
`metrics-sync`, `monthly-snapshot`, `health-monitor`, `newsletter`,
`refresh-tiers`). That string set is the join key between telemetry and map; a
typo breaks the link silently, so it is asserted in a test.

Other consequences that matter:

- A worker added later gets telemetry for free.
- Recording must never break a worker. Every insert/update is wrapped so a
  telemetry failure is logged and swallowed.
- The row is inserted *before* `fn()` runs and updated after, so a worker that
  crashes or times out still leaves evidence — a row with `finished_at IS NULL`
  is itself a diagnosable state ("detection started 40 minutes ago and never
  finished"), and the canvas renders it as a stalled node.

### Retention

Log TTL sweeping is a SQL function, `cleanup_old_logs(retention_days INT
DEFAULT 30)` (`supabase/migrations/20260420000002_functions_triggers_rls.sql:75`),
called once from `cleanup-worker.ts:344` with a single retention value for all
tables. A shorter TTL for `worker_runs` is therefore **not** a one-line
addition.

Decision: keep it simple and let `worker_runs` ride the existing 30-day sweep
by adding the table to `cleanup_old_logs` in a new migration. The cron schedule
produces roughly 170 runs a day (detection and health-monitor every 30 min,
publish twice an hour, processing hourly, plus the dailies and weeklies), so 30
days is about 5,000 rows — small enough that a bespoke 14-day path buys nothing
and costs a second retention mechanism to reason about.

---

## 5. Sub-project 1 — the blueprint canvas

### 5.1 The graph is a file

`src/lib/engine/blueprint.ts` declares every node and every edge.

```ts
export interface BlueprintNode {
  id: string;
  kind: 'source' | 'worker' | 'stage' | 'store' | 'external' | 'surface';
  label: string;
  ring: 0 | 1 | 2 | 3;
  feeds: string[];          // edges, by target id
  tier?: 1 | 2 | 3 | 4;     // sources only
  schedule?: string;        // cron expression, workers only
  worker?: string;          // worker_runs.worker key
  healthKey?: string;       // health-monitor check key
  errorSources?: string[];  // error_logs.source values that belong to this node
  doc: string;              // one paragraph, written for an agent
}
```

This file is the single source of truth. The canvas renders it; the state API
serves it; the architecture brief is generated from it. Adding a YouTube source
means adding one entry, and the picture, the API, the brief and the source
count all update together.

`errorSources` is what lets a raw `error_logs` row resolve to a place on the
map, which is the mechanism behind "click an error, watch the node light up"
and behind an agent answering "where did this break?"

### 5.2 Contents

- **Ring 0** — KumoLab core.
- **Ring 1** — pipeline arc: Detect → Score → Corroborate → Approve → Schedule → Publish.
- **Ring 2 left** — sources: 4 RSS feeds (MyAnimeList News, AnimeNewsNetwork,
  OtakuNews, Anime UK News) and 13 YouTube channels, grouped by tier.
- **Ring 2 right** — destinations: Instagram (representing the whole Meta
  surface: IG + Facebook + Threads via cross-post), X, YouTube, TikTok,
  kumolabanime.com.
- **Ring 3** — externals: AniList, YouTube Data API, Meta Graph, Supabase,
  Render yt-dlp worker, Stripe, Printful, Resend, GA4, OpenAI/Whisper.

Node counts are derived from `sources-config.ts` and `vercel.json` at build
time where possible rather than retyped, so the map cannot silently disagree
with the code.

One caveat to record: `dynamic-sources.ts` can in principle override the source
list from a `scraper-config.json` in Supabase Storage. It is **not** on the live
detection path — `detection-worker.ts:21` and `fetchers.ts:337,730` all import
the static `sources-config` — so build-time derivation is accurate today. If
that module is ever wired in, this map silently becomes wrong, so the
derivation carries a comment saying so.

### 5.3 Visual system

A scoped always-dark palette, following the precedent `studio.css:8` already
sets. That file scopes its override as `.admin-root .st-root`, so the blueprint
must use `.admin-root .jarvis` to win the same specificity battle — a bare
`.jarvis` selector loses to the theme tokens.

Base is a deep midnight field. Glow is KumoLab gold (`#e6c489`) and sea blue
(`#6fb2ff`), never Marvel cyan — it should read as KumoLab's own system, not a
costume. State colour uses the existing night tokens: `--ok #35c88a`,
`--sun #ff7a6b`.

Rendering is SVG with a small `requestAnimationFrame` loop, not a WebGL
dependency. The scene is a few hundred elements, well inside SVG's budget, and
SVG keeps text crisp, keeps nodes hit-testable and focusable, and keeps the
whole thing inspectable in devtools.

### 5.4 Life

All motion is driven by real data. Nothing animates to imply activity that did
not happen.

| Signal | Meaning | Source |
|---|---|---|
| Bright pulse travels an edge | that worker just ran | new `worker_runs` row |
| Node glow intensity | how recently it last succeeded | `worker_runs.started_at` |
| Node ring colour | its health | `health-monitor` check via `healthKey` |
| Slow breathing | idle and healthy | baseline |
| Faint carrier particles | ambient life | baseline |
| Red flicker | crit, or recent errors | `health-monitor` + `error_logs` |
| Hollow node, stalled ring | started and never finished | `finished_at IS NULL` past its window |

On mount the last 30 minutes of runs replay as pulses, so the page never opens
dead. It then polls `/api/admin/engine/state` every 20 seconds and fires a
pulse for each run it has not seen.

Discipline required for "always alive" not to become a battery fire:

- One shared rAF loop for the whole scene, not one per node.
- Loop stops on `document.hidden` and on `IntersectionObserver` leave.
- Particle count scales down with viewport area.
- `prefers-reduced-motion: reduce` disables ambient drift and particle travel
  entirely; state changes then appear as instant colour changes, and the page
  stays fully usable and fully informative.

### 5.5 Cinematic focus

Overview shows all rings. Clicking a node:

1. The camera flies to it — a single SVG `viewBox` transition, eased, ~400ms.
2. Its immediate neighbours resolve and label; everything else dims and recedes.
3. The inspector slides in with that node's live detail.
4. A breadcrumb appears; Escape or breadcrumb returns to overview.

The inspector shows, per node kind: schedule and last runs with durations and
result payloads (workers); tier, feed URL and recent candidate decisions from
`scraper_logs` (sources); which env var configures it and its health check
(externals); the node's `doc` paragraph, always.

Focus mode is also the mobile answer. A focused node with its neighbours is
readable at 360px, so the phone layout is the same code opening directly into a
shallower default zoom, with the inspector as a bottom sheet and pinch/pan
available.

---

## 6. Sub-project 2 — the clock

Replaces `PeakSlots` and `ScheduledFeed` with one object.

A 24-hour radial dial, midnight at top, all times US Eastern. A live hand
sweeps the current time.

- **Peak slot arcs** in gold, at the three configured times. Click an arc to
  edit its time inline; saves through the existing `savePeakSlots`.
- **Beads** on the rim: every upcoming approved post at its true ET angle,
  coloured by score using the existing exported `scoreColor`.
- **Standby tray** inside the dial: the pool with no slot yet, sorted by score.
- **Tap a bead** → post detail and the existing `ScoreBreakdownPopup`.

### Two tracks, not one

`getScheduledQueue` returns every approved post, but the pipeline runs two
independent scheduling products. `NEW_KEY_VISUAL` posts are Facebook-only, sit
on a separate off-peak hourly grid with their own `FB_KV_DAILY_CAP`, and are
deliberately excluded from Instagram slot claims and the 3/day cap
(`scheduler.ts:204,275`).

Rendering both as identical beads on one gold-arc dial would misrepresent the
system, and dragging a key-visual onto an Instagram peak slot would break a
documented invariant. So key-visual beads are visually distinct (hollow, on an
inner track) and **cannot be dropped onto a peak slot** — the drop is refused
with a reason rather than silently corrupting the split.

### Drag

Pointer Events, so mouse and touch share one path.

| Gesture | Result |
|---|---|
| Bead → occupied slot | **Swap.** The two posts trade `scheduled_post_time`. |
| Bead → empty slot | Move — subject to the daily-cap check below. |
| Standby → empty slot | Assign — subject to the daily-cap check below. |
| Standby → occupied slot | Occupant **cascades to the next open slot**. See below. |

**Swap is transactional, via RPC.** supabase-js has no client-side
transactions; every multi-row write in this codebase is either a per-row loop or
a `supabaseAdmin.rpc(...)` into a SQL function. The swap needs a new postgres
function `swap_post_slots(a uuid, b uuid, expected_a timestamptz, expected_b
timestamptz)` performing both `UPDATE`s in one body, compare-and-swap gated on
each row's expected current time — the same CAS pattern `scheduler.ts:428`
already uses. Without it a partial write leaves two posts in one slot.

The RPC handles **two already-scheduled rows only**; both sides are non-NULL by
construction, so plain equality in the CAS is sound. Assigning a standby post
is a different operation: a single-row update gated on
`.is('scheduled_post_time', null)`, which needs no transaction.

**No drag ever writes NULL.** This is the invariant the whole drag design rests
on, and getting it wrong is subtle. Pool membership *is*
`scheduled_post_time IS NULL` — `runSlotSelection`'s pool query is exactly
`.eq('status','approved').is('scheduled_post_time', null)`
(`scheduler.ts:379`). So any design that "returns a post to standby" writes
NULL, which drops that post into the pruner's path: at the next :05 or :35 tick
it is demoted to `status='pending'` if it is over 48h old, scored under 55, or
beyond `STANDBY_POOL_SIZE` (`scheduler.ts:452`). A drag could therefore silently
**unapprove** a post that was already scheduled. Unacceptable, so:

**Standby → occupied slot cascades.** The displaced occupant moves to the next
open peak slot rather than to the pool. If there is no open slot within the
booking lookahead, the drop is **refused** with that reason shown, rather than
parking a post somewhere the pruner can eat it. Every drag therefore ends with
every post it touched holding a real time.

**Move and assign must check the cap.** Swap and cascade preserve per-day counts
by construction, but move and assign both change the count for an ET day and can
push Instagram past `PLATFORM_DAILY_CAP.instagram = 3`. The endpoint runs the
existing `slotIsFree` check (`scheduler.ts:234`) for those two cases.

Two prerequisites the check carries, both easy to miss:

- `slotIsFree` (`:234`) and `loadSlotClaims` (`:195`) are module-private, and
  the former needs the `claims`/`dayCounts` only the latter produces. Both must
  be exported — the same class of omission as the ET helpers.
- `dayCounts` already counts the dragged post. Moving a post between two slots
  on the same ET day when that day is at 3/3 — the *normal healthy state* —
  would make `slotIsFree` return false and refuse a move that does not change
  the count at all. The endpoint must exclude the dragged post from its own
  day's tally before checking.

**A dragged post stays put.** Every scheduler write is CAS-gated on
`.is('scheduled_post_time', null)` (`scheduler.ts:432,467,486`), so the
auto-selector can never overwrite a manually assigned time. This is what makes
the feature real rather than cosmetic.

**Scores are not refreshed on drag.** `runSlotSelection` refreshes
`post_score`/`score_breakdown` when it books a slot (`scheduler.ts:421`). A
manual drag deliberately does not — Jose overriding the schedule is a statement
about placement, not a request to re-score. Bead colour therefore reflects the
score as of last automatic booking, which the inspector labels with its
timestamp.

Optimistic UI, then `POST /api/admin/engine/schedule`. The endpoint revalidates
server-side and returns the authoritative pair; a rejection rolls the UI back
with the reason shown.

### Time handling

Bead angles come from ET wall-clock minutes, not UTC offsets, so the dial stays
correct across the November DST shift.

The helpers that do this (`etWall` :88, `etHour` :92, `etDayKey` :97,
`etSlotInstant` :108) are module-private in `scheduler.ts`, and that module
imports `supabaseAdmin`, which **throws at module load** without
`SUPABASE_SERVICE_ROLE_KEY` and must never reach the browser.

So sub-project 2 has a prerequisite: extract them into a dependency-free
`src/lib/engine/et-time.ts`. Note the extraction must take **five** functions,
not three — `etWall` depends on `easternOffsetHours` (`:79`), and `etHour` is a
shared dependency of the others. `easternOffsetHours` is currently *exported*
and is imported by `scheduler-dst.test.ts`, so `scheduler.ts` must re-**export**
it rather than merely re-importing it, or that existing test breaks. Pure
refactor, no behaviour change, and it makes the helpers testable in isolation.

---

## 7. Sub-project 3 — diagnostics

A fault ring around the core, dark until something is wrong.

The panel below merges the three fault sources Jose named:

1. The 11 `health-monitor` checks.
2. `error_logs` from the last 24 hours, grouped by `source`.
3. Stuck posts — retry-exhausted, with their exact republish URL.

Every fault is emitted in one shape:

```ts
interface Fault {
  key: string;
  level: 'ok' | 'warn' | 'crit';
  label: string;
  detail: string;
  actionable?: string;
  nodeId?: string;   // resolved via BlueprintNode.errorSources / healthKey
  href?: string;     // where a human goes to fix it
}
```

`nodeId` is the join that makes faults spatial: clicking a fault focuses the
node that produced it, and an agent reading the state API can say which part of
the system is broken rather than only that something is.

Health checks are computed by the existing `getHealthSnapshot()`. It makes
eleven checks including a network call to the Render worker with a 60-second
timeout, so it is **not** called on page render.

**Nothing currently persists a snapshot.** `fireHealthAlertsIfChanged` writes
only a `{key: level}` map into `worker_locks.locked_by` under
`lock_key='health_state'` (`health-monitor.ts:486`) — no `detail`, no
`actionable`, no `checkedAt` — and the cron route returns the full snapshot to
Vercel and discards it (`route.ts:207`). The `Fault` shape defined above cannot
be built from that.

So sub-project 3 has a backend prerequisite: the health-monitor cron persists
the whole `HealthSnapshot` JSON. It goes in `engine_config` under key
`health_snapshot`, reusing the existing upsert-by-key pattern
(`engine-config.ts:70`) rather than adding a table for a single always-one-row
record. `engine_config.updated_at` has **no auto-update trigger**, so the
writer must set it explicitly or the reported age is wrong. The state API
serves that row with its age in minutes; a "re-check now" button triggers a
fresh run on demand.

---

## 8. Sub-project 4 — the agent layer

### 8.1 State contract

`GET /api/admin/engine/state` returns the entire system in one call:

```ts
{
  contract: 1;
  generatedAt: string;
  graph:  { nodes: BlueprintNode[]; edges: Edge[] };
  runs:   WorkerRun[];        // last 24h
  health: { snapshot: HealthSnapshot; ageMinutes: number };
  faults: Fault[];
  queue:  ScheduledItem[];
  slots:  PeakSlot[];
  tiers:  AnimeTier[];
  agents: AgentPresence[];
}
```

This is the contract an external agent connects to. It is versioned so a
connected agent can detect a breaking change rather than silently misread the
system.

**Auth needs a deliberate fix, not an assumption.** `middleware.ts:132` routes
every `/api/admin/*` path through `checkAdmin`, which requires a valid Supabase
**cookie** session and, for `/api/admin/engine`, the `content` permission
(`middleware.ts:38`). A bearer token carries no cookie, so an external agent
would hard-401 before the route ever runs.

Resolution: add a **new bearer branch** to `checkAdmin`, placed alongside the
`ADMIN_PUBLIC_API` early-return at `src/middleware.ts:79`. To be explicit,
because the distinction is a security bug waiting to happen: do **not** add
these paths to the `ADMIN_PUBLIC_API` set itself (`:19`) — that set is an
unconditional auth bypass, and using it would ship exactly the unauthenticated
endpoint this design is trying to avoid. The new branch admits a request only
when it carries a valid `Authorization: Bearer ${AGENT_API_KEY}`.

Two paths accept bearer auth: this route (read-only) and the heartbeat in §8.2
(write). The UI continues to authenticate by cookie on both. Keeping them under
`/api/admin` means they stay inside the middleware matcher and cannot be
reached by accident.

The response contains operational metadata only — no secrets, no tokens, no
customer or order data. A route test asserts that.

### 8.2 Presence

`POST /api/admin/agent/heartbeat` with `{ agent, activity, nodeId }`, backed by
an `agent_sessions` table with a short TTL.

The path matters. `src/middleware.ts:148` matches only `/api/cron/*`,
`/api/admin/*` and `/api/posts*` — a route at `/api/agent/*` would match
nothing and ship as a **completely unauthenticated public write endpoint**.
Placing it under `/api/admin/` puts it inside the existing matcher, where it
accepts either an admin cookie or the bearer key described in §8.1.

An agent that has posted a heartbeat in the last few minutes appears on the
canvas as a marker orbiting the node it is working on, with its activity string
readable on hover. This Claude Code session is wired in, so Jose can watch work
happen live on the map. An external agent connected by API calls the same
endpoint.

Presence is advisory and self-reported. It shows what an agent *says* it is
doing; it is not a security boundary and is not evidence that work occurred.

### 8.3 The brief

A popup, opened from a single button in the header. Three sections:

1. **Architecture brief** — generated from `blueprint.ts`. Every node grouped
   by ring, with its `doc`, its schedule, its health check and its failure
   modes. Because it is generated, it cannot drift from the map.
2. **Posting formula** — the existing six elements, moved out of the main view.
3. **KumoLab project goals** — the project-level goals, distinct from the APEX
   global goals. Drafted from CLAUDE.md and current priorities, for Jose to
   edit.

Read-only in this project. Section 2 reads the existing `post_formula` key.
Section 3 needs a new one: `project_goals`, following the same
`readKey(key, fallback)` shape as `getPostFormula`/`getPeakSlots`, with a
seeded default so the panel renders before anyone edits the row. Both are
editable in the database without a deploy; a UI editor is deliberately out of
scope.

---

## 9. Page layout

```
┌────────────────────────────────────────────┐
│  ENGINE          [ re-check ]  [ brief ▣ ] │
│                                            │
│            ·  ·  ·  ·  ·  ·                │
│         ·      (( CORE ))      ·           │   canvas hero
│            ·  ·  ·  ·  ·  ·                │   full viewport height
│                                            │
└────────────────────────────────────────────┘
   ▾ Schedule            (clock)
   ▾ Diagnostics         (faults)
   ▾ Priority tiers      (existing EngineTiers)
```

Sections below the hero are full-width, collapsible, and remember their open
state in `localStorage`. Everything is visible; nothing is more than one click
away.

On mobile the hero is 70vh, sections stack, and the inspector is a bottom
sheet.

---

## 10. File plan

```
src/lib/engine/
  blueprint.ts               the graph, single source of truth
  worker-runs.ts             withRun wrapper + queries
  faults.ts                  merges health + errors + stuck into Fault[]
  et-time.ts                 EXTRACTED from scheduler.ts, browser-safe

src/app/api/admin/engine/
  state/route.ts             the agent contract
  schedule/route.ts          drag writes
src/app/api/admin/agent/
  heartbeat/route.ts         presence (inside the middleware matcher)

src/middleware.ts            bearer branch in checkAdmin

src/components/admin/engine/blueprint/
  Blueprint.tsx              scene root, rAF loop owner, focus state
  Canvas.tsx                 SVG scene + viewBox camera
  Node.tsx  Edge.tsx  Pulse.tsx  Particles.tsx
  Inspector.tsx              drill-down drawer / bottom sheet
  jarvis.css                 scoped dark palette

src/components/admin/engine/clock/
  Clock.tsx  Dial.tsx  Bead.tsx  StandbyTray.tsx  useSlotDrag.ts

src/components/admin/engine/
  Faults.tsx  BriefDialog.tsx
  EngineTiers.tsx            unchanged, reused

src/app/admin/engine-blueprint/page.tsx    preview route

supabase/migrations/
  worker_runs table
  agent_sessions table
  swap_post_slots(a uuid, b uuid) function
  cleanup_old_logs replacement including worker_runs
```

Each component stays small and single-purpose. The rAF loop is owned in exactly
one place (`Blueprint.tsx`) and animation state flows down, so there is never a
second loop competing with it.

---

## 11. Testing

| Area | Approach |
|---|---|
| `withRun` | Unit: records success, records failure without swallowing the error, never throws when the insert fails. Asserts the worker-key set matches `route.ts`'s dispatch list. |
| `swap_post_slots` | Integration against a seeded pair: symmetric, preserves scheduled count, CAS rejects a stale expected-time, rejects a self-swap. |
| No-NULL invariant | **The one that protects a live post.** Integration: after every drag variant, assert no touched row has `scheduled_post_time IS NULL` and none moved to `status='pending'`. Explicitly covers standby→occupied cascading, and the refusal when no open slot exists. |
| Cap enforcement | Unit: move and assign refuse a drop that would put a 4th Instagram post in one ET day; swap and cascade are exempt; **a same-day move at 3/3 is allowed** (the dragged post is excluded from its own day count). |
| Key-visual split | Unit: a `NEW_KEY_VISUAL` post cannot be dropped on a peak slot. |
| `et-time.ts` | Unit: the extraction is behaviour-preserving, plus new coverage of a November DST boundary. Note `scheduler-dst.test.ts` provides **no reusable fixtures** — it only asserts `easternOffsetHours` returns 4 vs 5 for a handful of dates, so these cases are written fresh. |
| Fault merge | Unit: each of the three sources resolves to a `nodeId`; unmapped error sources degrade to no node rather than throwing. |
| State contract | Route test asserting shape, the `contract` version, that bearer auth is accepted, and that no secret-bearing field is present. |
| Heartbeat auth | Route test: an unauthenticated POST is rejected. |
| Canvas | Playwright: loads, focuses a node on click, returns on Escape, honours reduced-motion, no horizontal scroll at 360px. |

Verification per the `verify` skill: a build passing is not evidence. Sign-off
requires screenshots of the running page at desktop and 360px, a real cron fire
producing a visible pulse, and a real drag producing a changed
`scheduled_post_time` in the database.

---

## 12. Risks

**Animation cost.** "Always alive" on a phone is where this design most easily
becomes unpleasant. Mitigated by one shared loop, visibility gating, area-scaled
particle counts and a genuine reduced-motion path. Budget to hold: no measurable
battery drain with the tab backgrounded, and interaction staying responsive at
360px.

**Map drift.** A hand-maintained diagram that disagrees with the code is worse
than none, because an agent will trust it. Mitigated by deriving node lists from
`sources-config.ts` and `vercel.json` rather than retyping them, and by
generating the brief from the same file the canvas renders.

**Scope.** This is five sub-projects. Mitigated by the preview route: any
sub-project can ship or be cut without breaking the live Engine tab, and the
swap happens once at the end.

**Telemetry gap on first deploy.** `worker_runs` starts empty, so the canvas
will look quiet for up to 30 minutes after deploy. Expected, not a bug; the
empty state says so explicitly rather than rendering a dead map.

**Presence is theatre if taken literally.** The orbiting agent marker shows
what an agent *reports* it is doing. It is self-reported, advisory, and not
evidence that work happened. Worth keeping — Jose explicitly asked to see
agents working — but it must never be the thing anyone trusts to know whether a
job ran. `worker_runs` is that thing.

---

## 13. Review record

This spec was reviewed against the codebase twice on 2026-07-31.

Round one found six blocking issues, resolved above: no persisted health
snapshot (§7), bearer auth 401 on the state route (§8.1), an unauthenticated
heartbeat endpoint (§8.2), no transactional swap available in supabase-js (§6),
browser-unsafe ET helpers (§6), and a drag-to-standby that the pruner would
silently undo (§6).

Round two verified those fixes and found that **the fix to the last one was
worse than the bug**. The revision made standby→occupied a "swap", but pool
membership *is* a NULL slot time, so swapping a post into the pool necessarily
writes NULL onto a post that was already scheduled — handing the pruner a
chance to unapprove it. Now resolved by cascading the occupant to the next open
slot, refusing the drop when there is none, and holding one invariant: **no
drag ever writes NULL.** A test enforces it.

The lesson worth carrying into implementation: in this scheduler, NULL is not
an empty value, it is pool membership with side effects.

The review's most valuable finding was a negative: `publishScheduledPosts`
selects only on `status='approved' AND scheduled_post_time <= now`
(`engine.ts:308`), and every scheduler write is CAS-gated on a NULL slot time,
so a manual drag is genuinely honoured by the publisher and cannot be
overwritten. The headline feature rests on verified behaviour rather than an
assumption.
