> All agents must read [APEX.md](http://APEX.md) and [CLAUDE.md](http://CLAUDE.md) before this file.
>

> KumoLab is ACTIVE. Activated by Jose on 2026-04-20 after the previous Supabase filled up.
>

**Last updated:** 2026-05-02 | **Status:** 🟢 Active — Auto-publish flow producing fresh posts daily (latest: *Needy Girl Overdose | English Dub Trailer* from YouTube_Aniplex USA, auto-published 2026-05-02). Admin redesigned to a 3-route Console / Posts / Calendar surface. Editor overlay system rewired so toggles are independent, default OFF, auto-render on change. IG broadcast deliberately off (Meta page token expired 2026-05-01; awaiting fresh creds). AI provider intermittently 530'ing — caption falls back to deterministic templates.

---

## The Goal

Build KumoLab into a fully automated, multi-platform anime news and media brand generating consistent ad and sponsorship revenue. **North star:** 10k combined followers across all platforms — unlocks sponsorship pursuit.

---

## Phase Overview

| Phase | Name | Status | Description |
| --- | --- | --- | --- |
| **Phase 1** | Pipeline Rebuild | 🔴 Active | Storage redesign + automation layer + platform wiring before going live |
| **Phase 2** | Multi-Platform Launch | ⬜ Upcoming | Go live across all platforms simultaneously |
| **Phase 3** | Audience Growth | ⬜ Upcoming | Drive to 10k combined followers |
| **Phase 4** | Monetization | ⬜ Upcoming | Activate ads + pursue first sponsorships |
| **Phase 5** | Scale | ⬜ Upcoming | Optimize, expand, grow revenue |

---

## Phase 1 — Pipeline Rebuild 🔴 Active

**Trigger:** Jose activated KumoLab on 2026-04-20 after the previous Supabase ran out of storage.

**Exit condition:** Pipeline running cleanly on the new Supabase — detection, processing, auto-approval, scheduling, and publishing firing on schedule with retention enforced and automation gates operating.

### Milestone 1.1 — Storage Rebuild ✅ Complete

Previous Supabase scrapped (detection_candidates never pruned, logs unbounded, blog-images bucket never cleaned). Fresh start on new isolated project `xzoqsldtcoeaegxcdsia`.

- New Supabase project, public schema, us-east-1
- Slim posts schema (dropped raw_content, original_* translation fields, score_breakdown, fingerprint trio, quality_grade, needs_image, background_image, verification_*)
- detection_candidates as a true queue — rows deleted on process, not status-flagged
- `seen_fingerprints` unified dedup memory (replaces `declined_posts` + persistent post fingerprints)
- `expired_redirects` for Fork-2 expired slugs → 301 to social post
- 10 retention SQL functions + daily `/api/cron?worker=cleanup` at 03:00 UTC
- RLS on every table (service role only)
- Migration SQL committed under `supabase/migrations/2026042000000{1,2}_*.sql`

### Milestone 1.2 — Automation Layer ✅ Complete

Non-video news now auto-publishes when multi-source verification passes, not just T1 YouTube.

- Claim-type risk matrix (`automation-config.ts`) — AUTO / CORROBORATE / REVIEW / REJECT per tier
- AniList validation (`anilist-validator.ts`) — anime_id must resolve before auto-publish
- Multi-source corroboration (`corroboration.ts`) — ≥2 distinct T1/T2 sources within 12h
- Tone + safety AI pass (`ai.ts::checkToneAndSafety`) — asserts brand voice, catches hedging/cringe
- Auto-approval decision engine (`auto-approval.ts`) — pipelines the above into a verdict
- Scheduler v2 (`scheduler.ts`) — BREAKING / STANDARD / FILL lanes, peak-hour windows, 25-min min gap between slots
- Circuit breaker (`circuit-breaker.ts`) — 3+ declines in 24h pauses auto-publish for 6h
- Translate-once — Japanese source fields no longer persisted
- Fork 2 retention via `expires_at` (env-driven, default 60 days, unset = evergreen)
- **Visual-artifact gate** (PR #13, 2026-04-25) — never publish a post that can't display what it claims to be:
    • `TRAILER_DROP` requires `youtube_video_id` (extracted from source URL or article HTML by `video-extractor.ts`). Without it → manual review.
    • Everything else requires an image. Without it → manual review.
  Replaces an earlier broken bypass (PR #11) that let trailer posts publish with no embed and no image.
- **Trailer source allowlist** (2026-04-26) — `TRAILER_DROP` is now produced only by sources whose extractor can actually surface a video: any `YouTube_*` source (URL is the trailer) plus AnimeNewsNetwork (raw `<iframe>` embeds in article HTML). All other sources with "trailer" in the headline fall through to the next-best claim (season / visual / date) instead of producing a broken trailer post that gets stuck in manual review. Single source of truth: `automation-config.ts::TRAILER_TRUSTED_SOURCES` + `isTrailerTrustedSource()`. Crunchyroll News (JS-rendered embeds) is correctly excluded.
- **YouTube channel ID rewrite** (2026-04-26) — every prior channel ID in `sources-config.ts` was unverified and never resolved (all 11 channels had `consecutive_failures=16`, `last_success=NULL` — never once succeeded). Replaced the entire list with 10 channels resolved by fetching each `@handle` page and reading the canonical `channelMetadataRenderer.title` + channel URL. All 10 promoted to T1 because the `isT1YouTube` shortcut in `auto-approval.ts` is what auto-publishes trailers without manual review — anything below T1 routes to review and contradicts the directive. Source set: Crunchyroll, Netflix Anime, Aniplex USA, TOHO Animation, MAPPA, Kadokawa, A-1 Pictures, Viz Media, CloverWorks, Pony Canyon. Ufotable dropped (no resolvable @handle).
- **Image fallback wired** (2026-04-26) — `processing-worker.ts` now calls `image-selector.ts::selectBestImage(animeName, claimType)` whenever RSS yields no image. Strategy is AniList cover/banner → official-site OG image → Reddit search → reject. Closes the long-standing "every post lands image-less → manual review" gap.
- **Artifact gate hardened** (2026-04-26) — non-video posts that still have no image after the fallback chain now `REJECT` instead of `QUEUE_FOR_REVIEW`. Per Jose: every non-video post must ship with a real anime picture; better to lose the post than pile image-less rows in the review queue.
- **Security hardening pass** (2026-04-26) — closed the audit-flagged holes:
    • `src/middleware.ts` is the single chokepoint for API auth. `/api/cron/*` requires Vercel cron header or `CRON_SECRET` bearer; `/api/admin/*` requires a valid Supabase session validated via `getUser()` (round-trips to Supabase, not just cookie presence); state-changing methods on `/api/posts` go through the same admin gate.
    • `/api/posts` GET narrows to `status='published'` for unauthenticated callers — public can no longer enumerate pending/draft posts via `?status=pending`.
    • Deleted unauthenticated debug endpoints: `/api/test-insert`, `/api/debug-insert`, `/api/test-x-public`, `/api/admin/test-env`, `/api/admin/test-x-token`. All five let anyone POST garbage rows or leak env state.
    • Silent-failure paths in `engine.ts` closed: `recordPublishedFingerprint`, `social_ids` updates, and scheduled-fetch errors now flow through `logError()` into `error_logs` instead of `console.error` (which Vercel drops after ~24h).
    • External API timeouts: AniList 10s, Meta Graph 15s via shared `src/lib/http.ts::fetchWithTimeout`. Without these a hung upstream blocked the whole cron worker.
    • Schema-drift writes stripped from `custom-post`, `custom-url`, `generate` admin routes (`background_image`, `verification_*`, `twitter_tweet_id`, `studio_name`, `premiere_date` were silently dropped by PostgREST).
    • Required new env var: `CRON_SECRET` (Vercel Production). Documented in `CLAUDE.md`.
    • Repo root cleaned: ~140 v1-era debug artifacts deleted, `_archive_pre_rebuild/` migrations removed, `PostManager.tsx.new` orphan removed.
- **Admin console redesign** (2026-04-30 → 2026-05-02, PRs #21–#39) — collapsed 9 admin routes + 16 components down to **3 routes (Console / Posts / Calendar)** + post editor at `/admin/post/[id]`. Net ~3,800 lines deleted. New consolidated `src/app/admin/dashboard/page.tsx` is the at-a-glance landing (status pulse, stat grid, pending review with inline approve/decline, next 24h, recently published, source health, recent activity). New posts list at `src/components/admin/posts/PostsList.tsx` replaces the 3,441-line PostManager modal. Shared header in `src/components/admin/AdminHeader.tsx`. Hamburger menu killed.
- **Editor rewrite** (2026-05-02, PRs #33–#39) — `/admin/post/[id]` rewired multiple times after Jose hit successive bugs in production. Final state:
    • Reads/writes go through `/api/posts` (RLS service-role bypass via middleware-gated admin auth) — direct Supabase anon-key calls were throwing "Cannot coerce" because RLS returned 0 rows.
    • Toggle defaults are all **OFF** (`DEFAULT_SETTINGS` = `{ applyText: false, applyGradient: false, applyWatermark: false }`). User opts in.
    • Toggles are **independent** — gradient and watermark no longer cascade off when text is off. Image-processor's USER OVERRIDE block now wires all three (`if (typeof applyX === 'boolean') finalApplyX = applyX`); previously only `applyText` was honored and the other two booleans were silently discarded — that was the real reason gradient/watermark toggles "did nothing" no matter what was tried.
    • Auto-render fires on toggle change with 1.2s debounce. Title/Caption fields fire on blur. Live state passed to render endpoint as overrides (no more "edit text → click regenerate → DB reads stale title" bug).
    • Render endpoint source-URL priority: explicit override (if image-shaped) → YouTube CDN thumbnail (when `youtube_video_id` is set) → `post.image`. The cleanup worker had been sweeping previously-rendered Supabase Storage PNGs, leaving stale `post.image` URLs that returned HTTP 400 on every render attempt; the YouTube thumbnail is always reliable. 6 broken posts reset via SQL.
    • New `/api/cron?worker=render&postIds=A,B,C&text=0/1&gradient=0/1&watermark=0/1&gradPos=top/bottom` endpoint for server-to-server batch regen + end-to-end testing without admin auth.
- **Editor preview semantics + gradient strength** (2026-05-02) — third pass:
    • Renders are now **preview-only** by default. Render endpoint accepts `persist: boolean` — when false (auto-render, Force Regenerate, image upload), the renderer skips Storage upload and returns a base64 data URL; nothing touches the DB. Only **Save** sets `persist=true`, which uploads the PNG and writes `posts.image`. Fixes the bug Jose hit where regenerating a "100 girlfriends" pending post silently baked the overlay into the DB; the post now stays customizable until Save.
    • New **Cancel** button — routes back to `/admin/dashboard` without saving anything.
    • **Gradient strength** slider (0.3 – 1.5, default 1) multiplies every gradient alpha stop in the renderer; lets Jose soften or harden the fade on a per-post basis.
    • Nudge step shrunk from 30px → 12px so positioning feels precise instead of overshooting.
- **Editor layout + image upload + word color** (2026-05-02) — second pass after Jose tested live:
    • Gradient `top`/`bottom` now actually moves. Renderer's entropy auto-detect was overriding the user's choice whenever text was on; it now only runs when caller passes no `gradientPosition`.
    • Watermark visibility hardened — bumped to 30px Outfit with stroke outline + heavier shadow. Toggle was firing all along; the white-on-white was just invisible on bright trailer thumbnails.
    • Title and caption are now drawn as **independent blocks** with separate `titleScale` / `captionScale` (defaults 100% / 55%) and per-element pixel `titleOffset` / `captionOffset` nudges. Auto-shrink scales both proportionally when combined block won't fit the safe zone.
    • Editor adds a **Layout** card with scale slider + ↑↓←→ + Recenter for Title, Caption, and Watermark.
    • Editor adds an **Upload image** button (new `/api/admin/upload-image` endpoint stages the file under `blog-images/editor-uploads/`) so Jose can swap the render source to his own picture without leaving the editor.
    • Editor adds a **purple-word picker** chip row in the Overlay text card — click any word to flip it to KumoLab purple in the rendered overlay, click again to clear, plus Clear-all. Indices line up with the renderer's existing `purpleWordIndices` field.
- **Caption + content polish** (2026-05-02, PRs #34) — AI endpoint (`ollama.kumolabanime.com/v1`) returns Cloudflare 530 intermittently. New `src/lib/engine/caption-fallback.ts` produces deterministic claim-type-aware KumoLab-voice captions when AI is down (e.g. "X just dropped a new trailer. Real footage, not a teaser tease."). Detection-worker's seeded content for YouTube candidates enriched from `<label> from <channel>` to include the video title, so AI/fallback both have richer context. Failures now log to `error_logs` (was silent `console.warn`).
- **Build pipeline** — fixed the "fail-then-pass on every push" pattern by mirroring all 10 production env vars to Preview environment (preview builds were 5xx'ing because module-level Supabase guards threw on missing env). Verified two consecutive clean preview builds before declaring done.
- **Homepage feed UX** (2026-05-02, PRs #28, #30, #32) — clean post titles (channel suffixes stripped, multi-word ALL-CAPS de-shouted, single-word acronyms preserved), full YouTube native controls (`allowFullScreen`, `picture-in-picture`, `web-share`, `playsinline`), `View full post` link click bug fixed (`.cardGradient` had no `pointer-events: none` and was eating clicks), all card overlays hide while video is playing so iframe owns the tap surface (CC, settings, fullscreen, scrub bar, share work natively), small ✕ close button replaces overlays during playback so users have a way out. Hero overlay PNG removed from blog post page for video posts — embed IS the hero.

**Open blockers (not in flight, awaiting Jose):**
- **IG broadcasting**: Meta page token expired 2026-05-01 PDT. Need App ID + App Secret + fresh user token to mint never-expiring page token. Posts publish to website fine; IG/FB/Threads cross-posts are paused.
- **AI endpoint reliability**: ollama.kumolabanime.com upstream is 530'ing intermittently. Captions fall back cleanly; tone/safety pass fails closed (Japanese-translation posts get rejected when AI is down). Two paths: stabilize the ollama instance, or set `KIMI_API_KEY`/`OPENAI_API_KEY` in Vercel env so the AI provider chain in `ai.ts` failovers automatically.

### Milestone 1.3 — Platform Publishers ✅ Code Complete (pending credentials)

All code scaffolds built and wired into `publishToSocials()` on commit `136de23`. Each publisher no-ops gracefully when its credentials are missing so cutover doesn't wait on platform approvals.

- ✅ Instagram — live in code (Meta Suite cross-posts → Facebook + Threads)
- ✅ TikTok — scaffold complete (`src/lib/social/tiktok-publisher.ts`). Uses PULL_FROM_URL so TikTok fetches the staged MP4 from our `blog-videos` bucket. Awaits TikTok Developer App approval (Jose, ~2-4 weeks).
- ✅ YouTube Shorts — scaffold complete (`src/lib/social/youtube-publisher.ts`). OAuth 2.0 refresh-token auth, `videos.insert` multipart upload. Awaits Jose's one-time OAuth consent + refresh token.
- ✅ Trailer re-upload pipeline — `trailer-fetcher.ts` downloads YouTube video via `@distube/ytdl-core`, stages in `blog-videos` bucket. Scoped to `TRAILER_DROP` claims only.
- ⬜ X (Twitter) — **deferred** until revenue starts (Jose's call, 2026-04-21).
- ⬜ Video generation infrastructure — **deferred** entirely (Jose's call, 2026-04-21). Re-upload path covers trailers; non-trailer news skips video platforms until this is built.
- ⬜ Visible KumoLab branding on re-uploaded videos — **deferred**; accepting occasional DMCA takedowns.

### Milestone 1.4 — Admin Readiness ⬜ Deferred

Folded into Jose's upcoming admin dashboard redesign (separate project). No readiness work happening in Phase 1.

### Milestone 1.5 — Production Cutover ✅ Complete

**Final timeline:**
- 2026-04-21 ~00:00 — Old Supabase project (`pytehpdxophkhuxnnqzj`) deleted by Jose
- 2026-04-21 06:08 — PR #4 (v2 rebuild) squash-merged to main
- 2026-04-21 06:10 — New code deployed; appeared to work (returned `success: true`) but was silently writing to the void
- 2026-04-21–25 — "wait and retry" plan failed; investigation revealed two compounding bugs (see Resolution below)
- 2026-04-25 — Real cutover completed. Pipeline verified: detection found 8 candidates → processing accepted 5, rejected 3 → seen_fingerprints + scraper_logs + scheduler_logs all populated. Zero post-fix errors.

**Resolution — what was actually broken:**

1. **Hardcoded Supabase fallback in `src/lib/supabase/admin.ts`** pointed at the deleted `pytehpdxophkhuxnnqzj` project. Vercel had zero Supabase env vars set on `workspace-kumolab`, so production was hitting the deleted project's URL the whole time. The "exceed_storage_size_quota" error was Supabase's response when bucket calls hit a deleted project — never about our actual project. Fixed in PR #6 (`2707f2f`): both `admin.ts` and `client.ts` now throw at module load if env vars are missing.

2. **`detection-worker.ts` inserted a nonexistent `created_at` column** on `detection_candidates`, causing PostgREST to reject every insert. Worker swallowed the error and reported `new: 0` while logging to `error_logs`. Fixed in PR #7 (`5307d95`).

3. **Vercel env vars added** to `workspace-kumolab` Production: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `KUMOLAB_DEFAULT_RETENTION_DAYS=60`.

**Verified working post-cutover (2026-04-25 19:30 UTC):**
- 16 source_health rows populated
- 5 posts in pending review (RSS-sourced, no images so routed to manual review per decision engine — correct)
- 8 seen_fingerprints recorded (5 processed + 3 declined)
- All cron workers responding 200, writing data to new Supabase
- All 16 historical error_logs trace to the pre-fix detection runs; zero new errors

**Stale project note:** `kumolab-anime` Vercel project is a 40-day-old ghost from before the rebuild. As of 2026-04-25, the custom domain `kumolabanime.com` (and `www.kumolabanime.com`) was repointed from `kumolab-anime` → `workspace-kumolab` via `vercel alias set`. The stale project now has no aliases and is safe to delete. Production runs entirely on `workspace-kumolab`.

**Still pending (not blocking):**
- TikTok developer app approval (2-4 wk async)
- YouTube OAuth refresh token (Jose's one-time manual step)
- Image fetcher / canvas pipeline activation (currently every post lands as image-less → manual review)

---

## Phase 2 — Multi-Platform Launch ⬜ Upcoming

**Trigger:** Phase 1 complete (Milestones 1.3, 1.4, 1.5 all done)

**Exit condition:** All platforms publishing consistently for 2 weeks.

- Connect all platform API credentials in Vercel
- Run 48-hour silent test — queue posts but don't publish
- Review first batch manually, then enable `AUTO_PUBLISH_SOCIALS=true`
- Set up analytics tracking
- Announce relaunch (Jose-directed — timing and copy his call)

**Cadence at launch:** Website/blog: uncapped | Instagram (cross-posted to FB + Threads via Meta Suite): spaced 25+ min | TikTok + YouTube Shorts: firing only for `TRAILER_DROP` claims via trailer re-upload | X: deferred until revenue. Per-platform daily caps removed by design — spacing does the pacing, not count limits.

---

## Phase 3 — Audience Growth ⬜ Upcoming

**Trigger:** Phase 2 complete

**Exit condition:** 10k combined followers.

| Platform | Target |
| --- | --- |
| X | 3,000 |
| TikTok | 3,000 |
| Instagram | 2,000 |
| YouTube | 1,000 |
| Facebook | 500 |
| Website MAU | 5,000+ |
| **Combined** | **10,000+** |

- Double down on top-performing formats
- Build trending topics detection layer
- Increase TikTok + Shorts output — video drives growth fastest
- Community engagement (agent drafts, Jose approves)
- Track weekly in [SCOREBOARD.md](http://SCOREBOARD.md)

---

## Phase 4 — Monetization ⬜ Upcoming

**Trigger:** 10k combined followers

**Exit condition:** First sponsorship closed + ad revenue generating.

**Ads:** Install display ads on website, enable YouTube AdSense, enable TikTok Creator Fund when qualified.

**Sponsorships:**

- Build media kit — demographics, reach, engagement
- Target: anime merch brands, Crunchyroll/Funimation/HiDive, figure companies
- Sales Agent drafts outreach — Jose approves before sending
- First target: 1 paid deal. Set MRR target after close.

---

## Phase 5 — Scale ⬜ Upcoming

Grow content volume, expand sponsorship pipeline (2–3 active deals), explore affiliate and digital products. KumoLab MRR contributing toward global $50k goal.

---

## Content Strategy

| Type | Production | Cadence |
| --- | --- | --- |
| News clips | Fully automated | Daily |
| Rankings/lists | Automated with template | 2–3x/week |
| Opinion/editorial | Manual — Jose-directed, agent preps | As needed |
| Community/reaction | Manual — Jose-directed | As needed |

**Tone (non-negotiable):** Culturally fluent. Not cringe. Not corporate. Fan brand, not press outlet. **Posts assert claims in KumoLab's voice** — no "per @source" attribution hedging. Accuracy is enforced upstream by multi-source corroboration + AniList validation, not downstream by wording.

---

## Architecture Reminders

- **Supabase project:** `xzoqsldtcoeaegxcdsia` (new). Service role key in `.credentials/supabase.md` (gitignored).
- **All crons → `src/app/api/cron/route.ts`** — no parallel entry points. Workers: `detection`, `processing`, `dailydrops`, `daily-report`, `cleanup`.
- **Source URLs belong in `sources-config.ts`** — never hardcode.
- **Retention:** posts auto-expire at `published_at + KUMOLAB_DEFAULT_RETENTION_DAYS` (default 60). Unset = evergreen.
- **Dedup:** primary via `seen_fingerprints` table. Old "anime_id + claim_type + season_label" composite is gone.
- **Meta publishing:** IG only. Do NOT add direct FB or Threads API calls — Meta Suite cross-posts automatically.
- **Circuit breaker:** 3 declines in 24h → auto-publish pauses for 6h. Manual reset via `manualResetCircuitBreaker()`.
- Redeploy Vercel after any `vercel.json` cron changes.
- Test all cron endpoints with curl before reporting complete.

---

## KumoLab Metrics Tracker

| Metric | Current | Target |
| --- | --- | --- |
| X followers | — | 3,000 |
| TikTok followers | — | 3,000 |
| Instagram followers | — | 2,000 |
| YouTube subscribers | — | 1,000 |
| Facebook followers | — | 500 |
| Website MAU | — | 5,000 |
| **Combined** | **—** | **10,000** |
| Ad MRR | — | — |
| Sponsorship MRR | — | — |

---

*Maintained by Claude Code and the KumoLab Agent.*

*Jose has final authority over all phase transitions.*
