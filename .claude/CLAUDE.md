> Read [APEX.md](http://APEX.md) before this file. This file is project-scoped context for KumoLab.
>

> 🟢 **#1 PRIORITY (2026-06-19).** KumoLab is the company's primary focus. It is live, publishing, and has grown meaningfully since launch. The pipeline works — the job now is **monetization**: display ads + sponsorships + merch. See [APEX.md](http://APEX.md) + [GLOBAL-ROADMAP.md](http://GLOBAL-ROADMAP.md).
> 

## 01 — Project Identity

**Name:** KumoLab

**Type:** Anime news and media brand — automated content intelligence platform

**Owner:** Jose Gonzalez

**Status:** 🟢 Live — pipeline operational and publishing; audience growing. **Company #1 focus as of 2026-06-19.** Current emphasis: monetization (ads + sponsorships + merch).

**Primary Goals Served:** G1 (MRR), G2 (AI Execution), G5 (Scale)

**One-line description:**

KumoLab is an anime intelligence platform that automates detection, curation, and distribution of verified anime news. Multi-stage pipeline: detect → process → approve → publish, with a Next.js frontend/admin dashboard backed by Supabase.

---

## 02 — Mission

**Build KumoLab into a recognized anime news and media brand that generates consistent ad and sponsorship revenue — running largely on automation with Jose as the creative director.**

---

## 03 — Brand Identity

**Tagline:** *"Always in the lab. The cloud sees everything first. All things anime."*

**Tone:** Sharp, informed, culturally fluent. Not cringe. Not corporate.

**Visual identity:** Bold anime media aesthetic, dark/red palette

---

## 04 — Project Goals

| # | Goal | Description |
| --- | --- | --- |
| G1 | **Audience growth** | Grow following across all platforms |
| G2 | **Ad revenue** | Monetize website traffic via display ads |
| G3 | **Sponsorships** | Land brand deals with anime brands and streaming platforms |
| G4 | **Full automation** | Content pipeline runs 24/7 with minimal manual intervention |
| G5 | **Recognized brand** | KumoLab recognized as a quality source in the anime community |

---

## 05 — Tech Stack

| Layer | Technology |
| --- | --- |
| **Framework** | Next.js (App Router, TypeScript) |
| **Database** | Supabase (PostgreSQL + Auth + RLS) — project `xzoqsldtcoeaegxcdsia`, region us-east-1 |
| **Hosting** | Vercel (auto-deploy on push to `main`) |
| **Image processing** | `@napi-rs/canvas`  • `sharp` |
| **AI (scoring + translate + tone/safety)** | Provider chain in `src/lib/engine/ai.ts` — Gemini → Groq → DeepSeek → Kimi → OpenAI → Antigravity. First success wins. Heuristic + deterministic fallbacks per touchpoint so KumoLab keeps publishing English-source posts even with zero AI access. |
| **Social publishing** | `src/lib/social/publisher.ts` — **direct Graph API call per platform**: Instagram (Reels/image), Facebook Page (direct, `/video_reels` or `/photos`), Threads (direct Threads API, with `topic_tag`). The old Meta Suite IG→FB→Threads cross-post path was unreliable and has been REPLACED by direct calls. TikTok + YT Shorts fire only for YouTube-sourced/TRAILER_DROP posts; X deferred. |
| **Data sourcing** | AniList GraphQL API, RSS feeds, YouTube channels |

---

## 06 — Build & Deploy

```
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint

# Run blog engine manually
npm run engine:08:00
npm run engine:12:00
npm run engine:16:00
npm run engine:hourly

# Test cron endpoints locally
curl "http://localhost:3000/api/cron?worker=detection"
curl "http://localhost:3000/api/cron?worker=processing"
```

Deploy: push to `main` → Vercel auto-deploys. Redeploy after any change to `vercel.json` cron schedules. No automated tests — use curl + Vercel logs.

---

## 07 — Roadmap Reference

**Read `ROADMAP.md` before starting any feature work.**

**Current Phase:** Live operation + **Monetization**. The Phase 1 pipeline rebuild (storage + automation, new Supabase `xzoqsldtcoeaegxcdsia`) is complete and in production — KumoLab is publishing and growing. Focus has shifted from building the pipeline to making money from the audience it produces:

1. **Display ads** — wire an ad network to the site (AdSense to start; Mediavine/Raptive need ~50k sessions/mo — measure the gap). Website MAU must be instrumented first.
2. **Sponsorships** — media kit (audience + engagement + reach), rate card, outreach list of anime/streaming/game brands.
3. **Merch** — Printful + Stripe already wired (`PRINTFUL_ACCESS_TOKEN`, `STRIPE_SECRET_KEY`); confirm end-to-end and launch an initial drop.

> Verify before reporting revenue work "done": confirm the ad network is actually serving, a sponsorship is actually signed, or merch actually sells — not just that code/config exists.

---

## 08 — Architecture: Data Flow Pipeline

```
Detection Worker (every 30 min)
  → src/lib/engine/detection-worker.ts
  → Scans RSS feeds, YouTube, trending sources
  → Dedup via seen_fingerprints (unified memory) + live candidate queue
  → Writes to: detection_candidates

Processing Worker (hourly)
  → src/lib/engine/processing-worker.ts
  → Circuit-breaker check (pause if 3+ declines in 24h)
  → Translate-once (Japanese → English, source discarded)
  → Score → auto-approval decision engine:
      ▸ claim-type risk gate (automation-config.ts)
      ▸ AniList validation (anilist-validator.ts)
      ▸ multi-source corroboration (corroboration.ts)
      ▸ tone + safety AI pass (ai.ts::checkToneAndSafety)
      ▸ verdict: AUTO_APPROVE | QUEUE_FOR_REVIEW | REJECT
  → If AUTO_APPROVE: scheduler.ts assigns slot (BREAKING/STANDARD lane,
    peak-hour window, 25-min min gap) → posts.status='approved'
  → DELETE candidate row, record fingerprint in seen_fingerprints

Admin Dashboard (/admin)
  → Manual review + image editing for pending posts
  → Approve → scheduled_post_time set → publisher picks up on cron
  → Decline → DELETE post + INSERT seen_fingerprints (origin='declined')

Scheduled Publisher (own cron, hourly @ :20 — worker=publish)
  → src/lib/engine/engine.ts::publishScheduledPosts
  → Decoupled from the processing worker (was piggy-backed). A slow video
    publish stacked on processing could push that single request past the
    backstop caller's ~100s Cloudflare limit (HTTP 524) / Vercel's 300s, so
    publishing now runs as its own fast, isolated cron.
  → Checks circuit-breaker pause state; skips cycle if tripped
  → For each approved post past scheduled_post_time:
      ▸ set status='published', published_at, expires_at (+60d by default)
      ▸ publishToSocials(post):
          • Instagram always (Meta Suite cross-posts → FB + Threads)
          • If claim_type=TRAILER_DROP + YouTube source_url:
              - trailer-fetcher.ts downloads MP4 to blog-videos bucket
              - TikTok PULL_FROM_URL publish (if approved + token set)
              - YouTube Shorts multipart upload (if OAuth refresh token set)
          • X deferred until revenue
      ▸ capture returned platform IDs + URLs into posts.social_ids
      ▸ record fingerprint in seen_fingerprints (origin='published')

Cleanup Worker (daily @ 03:00 UTC)
  → src/lib/engine/cleanup-worker.ts
  → Calls cleanup_expired_posts → writes expired_redirects rows before
    deleting expired post rows → removes corresponding bucket files
  → Orphan-sweeps blog-images bucket
  → cleanup_old_logs (30d), cleanup_old_fingerprints (90d),
    cleanup_page_views (90d), cleanup_stale_locks, etc.
  → DB size probe — writes error_logs entry if >400 MB
```

---

## 09 — Cron Jobs

All routed through `src/app/api/cron/route.ts`.

| Worker | Schedule | Path |
| --- | --- | --- |
| `detection` | Every 30 min | `/api/cron?worker=detection` |
| `processing` | Every hour (:00) | `/api/cron?worker=processing` |
| `publish` | Every hour (:20) | `/api/cron?worker=publish` |
| `dailydrops` | 11:00 UTC | `/api/cron?worker=dailydrops` |
| `daily-report` | 04:00 UTC | `/api/cron?worker=daily-report` |
| `cleanup` | 03:00 UTC | `/api/cron?worker=cleanup` |
| `refresh-meta-token` | Mondays 05:00 UTC | refreshes `META_ACCESS_TOKEN` (90-day window) |
| `refresh-threads-token` | Weekly | refreshes `THREADS_ACCESS_TOKEN` (60-day token) |

---

## 10 — Key Library Modules (`src/lib/`)

| Module | Purpose |
| --- | --- |
| `engine/engine.ts` | Daily Drops + scheduled publishing + circuit-breaker gate |
| `engine/detection-worker.ts` | RSS/YouTube detection, dedup against `seen_fingerprints` |
| `engine/processing-worker.ts` | Score → decide → schedule; delete-on-process queue semantics |
| `engine/auto-approval.ts` | Verdict pipeline: risk gate → AniList → corroboration → tone/safety |
| `engine/scheduler.ts` | Lane classification (BREAKING/STANDARD/FILL) + slot assignment |
| `engine/automation-config.ts` | Single source of truth for claim risk matrix + platform targets + tunables |
| `engine/anilist-validator.ts` | Cached AniList existence check for anime_id / title |
| `engine/corroboration.ts` | Multi-source corroboration lookup against seen_fingerprints + posts |
| `engine/circuit-breaker.ts` | Correction counter → pause state in `worker_locks` |
| `engine/cleanup-worker.ts` | Daily retention sweep — expired posts, bucket orphans, log TTL |
| `engine/duplicate-prevention.ts` | detectDuplicate() via seen_fingerprints + title similarity |
| `engine/image-processor.ts` | Canvas-based image generation with text overlays |
| `engine/image-selector.ts` | Auto-selects best anime artwork from AniList/Crunchyroll |
| `engine/ai.ts` | AI abstraction (Kimi primary, OpenAI fallback) — translate, format, tone/safety, editorial |
| `engine/sources-config.ts` | RSS feeds, YouTube channels, content rules |
| `engine/intelligence-config.ts` | Source tiers and reliability scoring |
| `engine/fetchers.ts` | AniList GraphQL API, RSS parsing |
| `social/publisher.ts` | Orchestrator — IG always, TikTok + YT Shorts for TRAILER_DROP, X deferred |
| `social/trailer-fetcher.ts` | Downloads YouTube MP4 via @distube/ytdl-core → blog-videos bucket |
| `social/tiktok-publisher.ts` | TikTok Content Posting API, PULL_FROM_URL mode, no-ops without token |
| `social/youtube-publisher.ts` | YouTube Data API videos.insert, OAuth refresh-token auth, Shorts-ready |
| `blog.ts` | Post fetching + expired-slug redirect lookup (Supabase only; JSON fallback removed) |

---

## 11 — Database Tables

Core content: `posts` (slim — includes `published_at`, `expires_at`, `social_ids`), `detection_candidates` (true queue — rows deleted on process), `seen_fingerprints` (unified dedup: origin ∈ processed|declined|published), `expired_redirects` (Fork-2 deleted slugs → social URL).

Source + logs: `source_health`, `scraper_logs`, `action_logs`, `scheduler_logs`, `error_logs`, `processing_metrics`, `agent_activity_log`, `rejection_logs`, `page_views` (all 30–90 day retention via cleanup worker).

Admin UI: `agents`, `tasks`, `daily_reports`, `worker_locks`.

Full schema committed at `supabase/migrations/20260420000001_initial_schema.sql` + `..._02_functions_triggers_rls.sql`. Old migrations archived under `_archive_pre_rebuild/`.

---

## 12 — Environment Variables

Required in Vercel for production (after Phase 1 cutover):

**Supabase (new project `xzoqsldtcoeaegxcdsia`):**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

**Automation tunables (all have sensible defaults, env is override):**
- `KUMOLAB_DEFAULT_RETENTION_DAYS=60` — Fork 2 post expiry. Unset / `null` = evergreen (Fork 1).
- `KUMOLAB_CORROBORATION_HOURS=12`
- `KUMOLAB_CORROBORATION_MIN_SOURCES=2`
- `KUMOLAB_CIRCUIT_BREAKER_THRESHOLD=3`
- `KUMOLAB_PROCESSING_BUDGET_MS=150000` — wall-clock budget for the processing worker's candidate loop. Stops starting new candidates near the ceiling and defers the rest to the next hourly run (FIFO preserved, nothing dropped). Guards against detection-burst backlogs running the function past Vercel's 300s `maxDuration`. Lower it if `publishScheduledPosts()` (runs first in the same invocation) grows slow.

**Meta (Instagram + Facebook Page — direct Graph API, NOT Meta Suite):**
- `META_ACCESS_TOKEN` — page access token (drives both IG and FB Page direct posts). **Auto-refreshed weekly** via the `refresh-meta-token` cron (Mondays 05:00 UTC); each successful exchange resets the 90-day data-access window forward.
- `META_IG_ID`
- `META_APP_ID` + `META_APP_SECRET` — required for the auto-refresh path to call `oauth/access_token?grant_type=fb_exchange_token`.
- `AUTO_PUBLISH_SOCIALS=true`
- `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` + `VERCEL_TEAM_ID` — used by the refresh cron to update the token env entries in place via Vercel's REST API.
- FB Page ID is hardcoded in `publisher.ts` (`833836379820504`), not an env var.

**Threads (direct Threads Graph API — separate app + token from Meta):**
- `THREADS_ACCESS_TOKEN` — long-lived 60-day token, **refreshed weekly** by the `refresh-threads-token` cron worker.
- `THREADS_USER_ID`
- `THREADS_TOPIC_TAG` — optional, default `Anime Threads` (the ~343K-member community topic). One topic_tag per post; drops it into that discovery feed. Empty string disables.

> ⚠️ Local note (verified 2026-06-19): the live Meta/Threads tokens are kept in `.env.poll.tmp`, NOT `.env.local` (which only carries Supabase + AI keys). Production tokens live in Vercel and self-refresh via the weekly crons.

**TikTok (awaits developer app approval):**
- `TIKTOK_ACCESS_TOKEN` — user-scoped OAuth token from Content Posting API
- `TIKTOK_OPEN_ID` — user's open_id from OAuth (optional, for logging)

**YouTube Shorts (one-time OAuth consent required):**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — from Google Cloud project
- `YOUTUBE_REFRESH_TOKEN` — long-lived, generated via one-time OAuth consent flow

**AI (provider chain — first present wins, on failure walks to next):**
- `GEMINI_API_KEY` — Google AI Studio. Default model `gemini-2.5-flash`. Optional override: `GEMINI_MODEL` (e.g. `gemini-2.5-flash-lite` for cheaper, `gemini-flash-latest` to track newest).
- `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3` — optional, additional Google accounts. Each gets its own free-tier quota (separate GCP project). Stacking three triples daily volume at zero cost. `GEMINI_MODEL_2` / `GEMINI_MODEL_3` for per-key model overrides if needed; otherwise inherit `GEMINI_MODEL`.
- `GROQ_API_KEY` — console.groq.com (free tier, ~14,400 req/day on `llama-3.3-70b-versatile`). Optional override: `GROQ_MODEL`.
- `DEEPSEEK_API_KEY` — platform.deepseek.com (paid; cheap last-resort). Optional override: `DEEPSEEK_MODEL` (default `deepseek-chat`).

Legacy tail (still honored if set, but not required):
- `KIMI_API_KEY` (or `MOONSHOT_API_KEY`) — optional override: `KIMI_MODEL`
- `OPENAI_API_KEY` — optional override: `OPENAI_MODEL`
- `ANTIGRAVITY_AI_ENDPOINT` (+ optional `ANTIGRAVITY_AI_KEY`, `ANTIGRAVITY_AI_MODEL`) — old self-hosted Ollama tunnel; safe to delete.

If every provider fails the chain falls through to per-touchpoint deterministic fallbacks (caption template, heuristic tone/safety, return-original translation, return-raw title). KumoLab keeps publishing English-source posts with no AI calls at all.

**Auth / security:**
- `CRON_SECRET` — required. Random 32+ char string. Used by `middleware.ts` and `/api/cron/route.ts` for `Authorization: Bearer ${CRON_SECRET}` fallback when not running under Vercel cron. Set in Vercel Production env.
  - Vercel cron itself sets `x-vercel-cron: 1` automatically; the bearer token is for manual / GitHub-Actions invocations.

**Other (existing):** `PRINTFUL_ACCESS_TOKEN`, `STRIPE_SECRET_KEY`, `YOUTUBE_API_KEY`, `X_BEARER_TOKEN` (X publish is deferred; these stay for other uses)

Local dev: keys live in `.env.local` (gitignored). Human-readable reference at `.credentials/supabase.md` (also gitignored).

**DEAD — do not reintroduce:** `NEXT_PUBLIC_USE_SUPABASE` (dual-mode fallback was removed in v2).

---

## 13 — Architecture Decisions (Locked)

- **Next.js App Router** — No Pages Router.
- **Supabase** — Auth, DB, storage. Project `xzoqsldtcoeaegxcdsia` (isolated from ABS). Do not introduce a second auth system.
- **Canvas-based image processing** — `@napi-rs/canvas` server-side. Do not replace.
- **Dedup via `seen_fingerprints`** — unified memory (origin ∈ processed|declined|published). Primary fingerprint is a hash of normalized title + source host. Old "anime_id + claim_type + season_label" composite is retired. Don't re-introduce `declined_posts`.
- **Fork-2 retention** — posts carry `expires_at`; daily cleanup worker deletes + writes redirect. NULL expires_at = evergreen. Controlled by `KUMOLAB_DEFAULT_RETENTION_DAYS`.
- **Direct Graph API fan-out, one call per platform** — `publisher.ts` posts independently to Instagram, the Facebook Page (`FB_PAGE_ID` 833836379820504, via `/video_reels` or `/photos`/`/feed`), and Threads (`graph.threads.net`, with `topic_tag` for discovery). The old Meta Suite cross-post path (IG → FB + Threads) was unreliable and is RETIRED — the IG→FB and IG→Threads cross-post toggles are left OFF so we don't double-post. A per-post idempotency lock (`worker_locks`, key `publish:{id}`) prevents duplicate publishes since the Meta APIs are not idempotent. *(Corrected 2026-06-19 — this section previously said the opposite; verified against code.)*
- **No per-platform daily caps** — spacing (`MIN_GAP_MINUTES`) does the pacing, not count limits. Trailers meant to be uncapped.
- **No attribution-in-copy** — posts assert claims in KumoLab's voice. Accuracy enforced upstream (multi-source + AniList + tone check), not by "per @source" wording.
- **Circuit breaker is the sole brake** — no dead-man switch. 3 declines in 24h → 6h pause. Manual reset via `manualResetCircuitBreaker()`.
- **Cron routing** — All crons route through `src/app/api/cron/route.ts`. No parallel entry points.
- **Auth surface** — `src/middleware.ts` is the single chokepoint for API auth. `/api/cron/*` requires Vercel cron header or `CRON_SECRET` bearer. `/api/admin/*` requires a valid Supabase session (validated server-side via `getUser()`, not just cookie presence). Page routes under `/admin/*` are gated independently in their layout.tsx server components. Don't reintroduce unauthenticated `test-env` / `test-x-token` style debug endpoints.
- **Analytics writes go through `/api/track` (service role), never the anon client.** This DB is RLS-on with NO table policies (service-role-only), so browser anon-key inserts are silently denied. `page_views` recorded ZERO rows for ~2 months because `AnalyticsTracker` inserted with the anon key (fixed 2026-06-19). The public `/api/track` route writes via `supabaseAdmin` (bypasses RLS) and derives `is_bot` + `user_agent` from request headers. `AnalyticsTracker.tsx` POSTs to it. The admin Analytics page reads via `src/lib/analytics/page-views.ts` (service role). Do NOT revert to a direct anon insert, and do NOT "fix" this by adding an anon INSERT policy (that opens a spammable unauthenticated write into traffic data we base ad/sponsor decisions on).

---

## 14 — Publishing Targets

No daily caps. Spacing (25-min min gap) does the pacing. Platforms fall out of the scheduler's target list when claim type doesn't fit (e.g. text news skips TikTok).

| Platform | Status | Notes |
| --- | --- | --- |
| Website/blog | ✅ Live | Every auto-approved post |
| Instagram | ✅ Live | Meta Suite cross-posts → Facebook + Threads |
| TikTok | 🟡 Scaffold | Code ready, awaits TikTok developer app approval. Scoped to TRAILER_DROP via trailer re-upload. |
| YouTube Shorts | 🟡 Scaffold | Code ready, awaits one-time OAuth consent + refresh token. Scoped to TRAILER_DROP. |
| X (Twitter) | ⬜ Deferred | Until revenue starts (Jose's call 2026-04-21) |

---

## 15 — Agent Rules (KumoLab-Specific)

- Always read [ROADMAP.md](http://ROADMAP.md) before any feature work
- Never publish content that contradicts KumoLab's tone — no corporate speak, no cringe
- Quality over volume — a bad post damages the brand more than no post
- Always test cron endpoints with curl before reporting complete
- Redeploy to Vercel after any change to `vercel.json` cron schedules
- Never hardcode source URLs or RSS feeds — they belong in `sources-config.ts`
- Facebook + Threads publish via **direct Graph API calls** in `publisher.ts` (Meta Suite cross-post is retired — do not re-enable the IG→FB / IG→Threads toggles, that would double-post). Keep the per-post `worker_locks` idempotency lock intact.
- Do not re-introduce `declined_posts` or a `NEXT_PUBLIC_USE_SUPABASE` JSON-fallback — both were removed in the v2 rebuild for storage + simplicity reasons
- HARD RULE (Jose, 2026-06-08): NO em dashes or en dashes in ANY KumoLab content — titles, captions, copy, anywhere. Use a comma, colon, the " • " bullet, or a plain hyphen. Enforced deterministically by `stripFancyDashes()` (`src/lib/engine/utils.ts`), applied in `processing-worker.ts` (`sanitizeString`) and `ai-import-draft.ts`, and reinforced in the AI prompts. Applies to anything Claude writes for the brand too.

---

## 17 — Session Log

| Date | Summary |
| --- | --- |
| 2026-06-19 | Strategic realignment — KumoLab set as company #1 focus. Status updated from "pipeline rebuild" to "live + monetizing." Documented monetization track (display ads + sponsorships + merch). Global brain files (APEX / GLOBAL-ROADMAP / SCOREBOARD) updated to match. Audience metrics flagged stale (last pull 2026-05-07) — refresh next session. |

---

*This file is maintained by Claude Code. Jose has final edit authority.*