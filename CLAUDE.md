> Read [APEX.md](http://APEX.md) before this file. This file is project-scoped context for KumoLab.
>

> Status: 🔴 Active — Jose activated KumoLab on 2026-04-20. Storage + automation rebuild in Phase 1. See [ROADMAP.md](http://ROADMAP.md).
> 

## 01 — Project Identity

**Name:** KumoLab

**Type:** Anime news and media brand — automated content intelligence platform

**Owner:** Jose Gonzalez

**Status:** 🔴 Active — Phase 1 (Pipeline Rebuild) in progress as of 2026-04-20

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
| **Social publishing** | Instagram Graph API via `src/lib/social/publisher.ts` — Meta Suite cross-posts IG → FB + Threads automatically. X / TikTok / YT Shorts publishers pending (Milestone 1.3). |
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

**Current Phase:** Phase 1 — Pipeline Rebuild. All code complete on `claude/storage-rebuild`. Old Supabase deleted 2026-04-21. Production cutover (Vercel env vars + branch merge) is the last remaining step.

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

Scheduled Publisher (hourly, piggy-backs on processing worker)
  → src/lib/engine/engine.ts::publishScheduledPosts
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
| `processing` | Every hour | `/api/cron?worker=processing` |
| `dailydrops` | 11:00 UTC | `/api/cron?worker=dailydrops` |
| `daily-report` | 04:00 UTC | `/api/cron?worker=daily-report` |
| `cleanup` | 03:00 UTC | `/api/cron?worker=cleanup` |

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

**Meta (IG + Meta Suite cross-post):**
- `META_ACCESS_TOKEN`, `META_IG_ID`, `AUTO_PUBLISH_SOCIALS=true`

**TikTok (awaits developer app approval):**
- `TIKTOK_ACCESS_TOKEN` — user-scoped OAuth token from Content Posting API
- `TIKTOK_OPEN_ID` — user's open_id from OAuth (optional, for logging)

**YouTube Shorts (one-time OAuth consent required):**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — from Google Cloud project
- `YOUTUBE_REFRESH_TOKEN` — long-lived, generated via one-time OAuth consent flow

**AI (provider chain — first present wins, on failure walks to next):**
- `GEMINI_API_KEY` — Google AI Studio. Default model `gemini-2.5-flash`. Optional override: `GEMINI_MODEL` (e.g. `gemini-2.5-flash-lite` for cheaper, `gemini-flash-latest` to track newest).
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
- **Meta Suite does the Meta fan-out** — publisher hits Instagram API only. Do NOT add direct Facebook or Threads API calls; Meta Suite cross-posts IG → FB + Threads automatically on Jose's side. Duplicating here would double-publish.
- **No per-platform daily caps** — spacing (`MIN_GAP_MINUTES`) does the pacing, not count limits. Trailers meant to be uncapped.
- **No attribution-in-copy** — posts assert claims in KumoLab's voice. Accuracy enforced upstream (multi-source + AniList + tone check), not by "per @source" wording.
- **Circuit breaker is the sole brake** — no dead-man switch. 3 declines in 24h → 6h pause. Manual reset via `manualResetCircuitBreaker()`.
- **Cron routing** — All crons route through `src/app/api/cron/route.ts`. No parallel entry points.
- **Auth surface** — `src/middleware.ts` is the single chokepoint for API auth. `/api/cron/*` requires Vercel cron header or `CRON_SECRET` bearer. `/api/admin/*` requires a valid Supabase session (validated server-side via `getUser()`, not just cookie presence). Page routes under `/admin/*` are gated independently in their layout.tsx server components. Don't reintroduce unauthenticated `test-env` / `test-x-token` style debug endpoints.

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
- Never add a direct Facebook or Threads API call — Meta Suite handles those via IG cross-post
- Do not re-introduce `declined_posts` or a `NEXT_PUBLIC_USE_SUPABASE` JSON-fallback — both were removed in the v2 rebuild for storage + simplicity reasons

---

## 17 — Session Log

| Date | Summary |
| --- | --- |
| — | — |

---

*This file is maintained by Claude Code. Jose has final edit authority.*