> All agents must read [APEX.md](http://APEX.md) and [CLAUDE.md](http://CLAUDE.md) before this file.
>

> KumoLab is ACTIVE. Activated by Jose on 2026-04-20 after the previous Supabase filled up.
>

**Last updated:** 2026-07-14 | **Status:** 🟢 Live + **monetizing now.** The pipeline is built, stable, and auto-publishing to Website + Instagram + Facebook Page + Threads (direct Graph APIs), plus YouTube Shorts for edited-only content. The audience exists; **the current job is to turn it into revenue, not to keep polishing the machine.** Monetization is NOT gated behind a follower count (that old "10k unlocks sponsorship" framing is retired — it steered three weeks of effort away from the only goal at 0%). See "Current Focus" below.

---

## The Goal

Turn KumoLab's existing, growing audience into **KumoLab's first repeatable revenue**, then scale it — contributing to Gonzalez Umbrella Co.'s $50k MRR goal (G1). KumoLab is priority **#1** in `GLOBAL-ROADMAP.md` Phase 1.

Three revenue lines, all monetize-now (no follower gate):
1. **Display ads** — AdSense on the blog to start; Mediavine/Raptive when traffic qualifies (~50k sessions/mo).
2. **Sponsorships** — media kit + rate card from real analytics; outreach to anime / streaming / game brands.
3. **Merch** — Printful + Stripe wired and the store is live; grow with drops.

**Exit condition (this phase):** first repeatable revenue from at least one line — ads running, a sponsorship closed, or merch selling. Audience growth continues in the background but does not block monetization.

---

## Current Focus — Monetization (mirrors GLOBAL-ROADMAP Phase 1)

Fable 5 deep audit (2026-07-11, `AUDIT-Fable5-2026-07.md`) verdict: the engineering core is strong and the business is stalled at $0 because every recent deliverable was polish. Ship revenue.

- **Ads:** apply to AdSense, drop the snippet on the blog. Track the gap to premium-network qualification.
- **Sponsorships:** ✅ **live media kit shipped 2026-07-15** at `/media-kit` (noindex, shareable) — pulls real reach live via `src/lib/analytics/media-kit.ts`, with rate card + breakout-Reel proof. Outreach targets + rate rationale in `MEDIA-KIT.md`. Next: Jose confirms rates → send to first 3 targets.
- **Merch:** store is live end-to-end; plan a first drop, variants, and cadence.
- **Keep the pipeline stable + growing** in the background — it is the asset all three lines sit on.
- **Protect the autonomous core:** publish-correctness + health-monitor hardening (2026-07-14) so silent failures surface.

---

## Phase Overview

Phases here track KumoLab's own build; revenue phases roll up to `GLOBAL-ROADMAP.md`.

| Phase | Name | Status | Description |
| --- | --- | --- | --- |
| **Phase 1** | Pipeline Rebuild | ✅ Complete | Storage redesign + automation layer + platform wiring before going live |
| **Phase 2** | Multi-Platform Launch | ✅ Complete | Live across Website + IG + FB + Threads (+ YT Shorts edited-only) |
| **Phase 3** | Monetization + Growth | 🟢 Active | Stand up ads + sponsorships + merch NOW; keep growing audience in parallel |
| **Phase 4** | Scale Revenue | ⬜ Upcoming | Scale the working line(s); premium ad network; repeatable sponsor pipeline |
| **Phase 5** | Maturity | ⬜ Upcoming | Automated engines; KumoLab MRR compounding toward the $50k global goal |

---

## Phase 1 — Pipeline Rebuild ✅ Complete

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
- **IG Reels for TRAILER_DROP + watermarked video** (2026-05-03) — Instagram was publishing the rendered overlay PNG even on trailer days because the publisher was wired to the image-only flow. Fixed:
    • New `src/lib/social/video-processor.ts` runs the staged trailer through FFmpeg (via `ffmpeg-static`): scale-letterbox to 1080×1920 (Reels-native), burn `@KumoLabAnime` watermark bottom-right (Outfit Black, white-on-shadow for legibility), hard-trim to 60s. H.264/AAC, faststart, mp4. Output replaces the raw download in the `blog-videos` bucket so TikTok + YT Shorts also use the rebranded version.
    • `trailer-fetcher.ts` calls the processor right after download. Fall-through: if FFmpeg fails for any reason, the unprocessed buffer ships rather than blocking the publish.
    • `publisher.ts` reordered: trailer fetch + processing now runs **before** Instagram so the staged URL is available when IG publishes. `publishToInstagram(post, stagedVideoUrl)` switches between the **REELS** container (`media_type=REELS`, `video_url=...`, `share_to_feed=true`) and the existing image container based on whether a staged video exists. Reels containers get a status_code poll (up to 60s) instead of the legacy 4s sleep — IG needs more time to ingest + transcode video.
    • `next.config.mjs` adds `ffmpeg-static`/`fluent-ffmpeg`/`@distube/ytdl-core` to `serverExternalPackages` and traces both `node_modules/ffmpeg-static/**` and `public/fonts/**` into the cron function output, so the binary + watermark font ship to the Vercel runtime.
    • DMCA mitigation already wired: brand watermark + 60s trim. Posture: accept occasional takedowns; brand stays visible on re-shares.
- **AI provider independence** (2026-05-03) — KumoLab's automation no longer depends on a single AI vendor or any infrastructure Jose has to keep running:
    • `src/lib/engine/ai.ts` rewritten as a **provider chain**: Gemini → Groq → DeepSeek → (legacy: Kimi → OpenAI → Antigravity). First successful response wins; each provider failure walks to the next before any caller-level fallback runs. All three primaries speak the OpenAI chat-completions schema (Gemini via its `/v1beta/openai` endpoint).
    • **Default chain is free-first**: Gemini and Groq both have free tiers covering KumoLab's daily volume; DeepSeek is the paid last-resort (Jose's key shipped). Total expected cost: ~$0/month.
    • **Per-touchpoint deterministic fallbacks** — if every provider in the chain fails:
        - generateCaption → claim-type-aware template (`caption-fallback.ts`)
        - translateToEnglish → returns original text (candidate stays processable)
        - formatKumoLabTitle → returns raw title
        - checkToneAndSafety → heuristic phrase/length scan (CRINGE_PHRASES, HEDGE_PHRASES, UNSAFE_PATTERNS, !-count, all-caps detection). Permissive enough to keep auto-publish moving; flagged candidates queue for review, never reject.
        - generateFromIntel → returns null (caller skips this candidate)
    • **Net result**: KumoLab's English-source pipeline runs end-to-end with zero AI calls. Non-English candidates re-queue (don't reject) when AI is unavailable. Provider keys are interchangeable — Jose can swap models without touching code.
    • Self-hosted `ollama.kumolabanime.com` tunnel is now optional; can be retired entirely (it's just one tier in the chain).
    • Required Vercel env adds: `GEMINI_API_KEY`, `GROQ_API_KEY`, `DEEPSEEK_API_KEY`.
- **Editor render-on-open + Reset image** (2026-05-02) — fourth pass after Jose flagged "every pending post shows overlay text even with Show Text off":
    • Root cause: editor was displaying `post.image` as-is on open. For posts touched in the pre-fix editor, that PNG already had overlays baked in. Toggles being off in session state didn't change the displayed image until something fired a render — and "Force Regenerate" with the baked PNG as render source produced an identical image (no new overlays added on top of an already-baked source).
    • Fix 1 — **render-on-open**: editor now fires a preview render immediately after the post loads, using DEFAULT_SETTINGS (all toggles off). The displayed image now matches the UI state from the moment the editor mounts. For YouTube posts the render uses the CDN thumbnail (always clean); for non-YouTube posts where `post.image` is clean, the preview is also clean.
    • Fix 2 — **Reset image button** + new `/api/admin/reset-image` endpoint. For YouTube posts, returns the CDN thumbnail. Otherwise calls `selectBestImage(title, claim_type)` to fetch a fresh AniList/Crunchyroll cover. Editor uses the returned URL as `sourceUrl` and re-renders. This is the recovery path for posts whose `post.image` got baked from earlier editor testing.
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

- **Tri-platform direct publishing** (2026-05-04) — replaced the brittle Meta Suite IG→FB→Threads cross-post toggle with **direct Graph API calls** to all three platforms inside `publishToSocials()`. The cross-post UI page on Meta's web is currently broken for the kumolabanime account (consistent 500s across desktop/mobile/IG-side/FB-side surfaces — confirmed Meta server-side bug); now it doesn't matter. Each platform publishes via its own contract:
    • **Instagram** — Reels API for video posts, image post otherwise. Container + status_code poll + publish (existing).
    • **Facebook Page** — `/{PAGE_ID}/video_reels` 3-phase (start → hosted-URL upload → finish) for video, `/{PAGE_ID}/photos` for image. Uses the freshly minted page token with `pages_manage_posts` scope (re-OAuthed via Graph Explorer to add `instagram_manage_insights` + `instagram_manage_comments` + `pages_manage_posts`; never-expiring page token, `data_access_expires_at: 2026-08-02`).
    • **Threads** — separate **KumoLab Threads** Meta app (App ID `1254048673427302`, Threads App ID `1927422184574661`) created from scratch with the "Access the Threads API" use case. kumolabanime added as Threads tester, invite accepted via threads.net → Account Settings → Website permissions. OAuth flow at `threads.net/oauth/authorize` with `threads_basic + threads_content_publish + threads_manage_insights` scopes; auth code exchanged via `/api/oauth/threads/callback` (one-shot endpoint we built) to a 60-day long-lived token. `publishToThreads(post, stagedVideoUrl)` uses the same Supabase MP4 we already feed IG/FB Reels — VIDEO/IMAGE/TEXT branching with status-poll on video. Container creation → `FINISHED` poll → `/threads_publish`. Captures `threads_id` + `threads_url` into `posts.social_ids`.
    • **No more cross-post toggle dependency anywhere** — IG cross-post in the user's IG mobile-app settings should be left OFF for FB and ON for Threads (or both off; doesn't matter since we're posting directly). Today's 8 published posts confirmed live on all 3 platforms via backfill.
    • **Auto-refresh wired** — `refresh-meta-token` cron Mondays 05:00 UTC + new `refresh-threads-token` cron Tuesdays 05:00 UTC (`src/lib/engine/threads-token.ts`). Both call their respective refresh endpoints and hot-swap the rotated token into Vercel env via the Vercel REST API, so no redeploy needed for token rotation. New env vars in Vercel prod + preview: `THREADS_APP_ID`, `THREADS_APP_SECRET`, `THREADS_USER_ID`, `THREADS_ACCESS_TOKEN`. New endpoints (Meta-required): `/api/oauth/threads/{callback,deauthorize,data-deletion,data-deletion/status}`.
- **Insights APIs unlocked** (2026-05-04) — fresh Meta page token includes `instagram_manage_insights` + `instagram_manage_comments`. Live-tested: per-post IG insights call returns real `reach/likes/comments/shares/saved` data. Threads token has `threads_manage_insights`. Foundation for the planned analytics dashboard worker (next milestone candidate).
- **AI endpoint reliability resolved** (2026-05-03) — old `ollama.kumolabanime.com` 530s replaced with the multi-provider chain (Gemini × 2 → Groq → DeepSeek). Free-first, paid last-resort. KumoLab no longer depends on any single AI vendor or Jose-maintained infra.

### Milestone 1.3 — Platform Publishers ✅ Live

- ✅ **Instagram** — live, direct Graph API. Reels for video posts (status_code poll up to 60s), image otherwise.
- ✅ **Facebook Page** — live, direct Graph API. `/video_reels` 3-phase for video, `/photos` for image. Replaces the unreliable Meta Suite cross-post path. **No env-flag gating** — direct FB post is the canonical path.
- ✅ **Threads** — live, direct Threads API via separate **KumoLab Threads** app. VIDEO/IMAGE/TEXT branching, status-poll on video, 60-day token refreshed weekly via cron.
- 🛑 **TikTok** — **on hold (2026-05-13).** Three dev-app rejections in 9 weeks; the May 11 rejection was policy-level (`"App will not be approved for personal or company internal use. Not acceptable: Display posts from the TikTok account(s) you or your team manage on your website."`). TikTok's Content Posting API is designed for third-party tools where external users connect *their own* accounts — first-party automation of an owned account is rejected on principle, not by configuration. Jose's call: stop chasing API approval. Future path will be Playwright-based UI upload (browser automation against the kumolabanime TikTok web account), revisited once the rest of the pipeline is stable. Scaffold (`src/lib/social/tiktok-publisher.ts`) stays as a graceful no-op; no code rollback needed.
- ✅ **YouTube Shorts** — scaffold complete (`src/lib/social/youtube-publisher.ts`). OAuth 2.0 refresh-token auth, `videos.insert` multipart upload. Awaits Jose's one-time OAuth consent + refresh token.
- ✅ **Trailer re-upload pipeline** — `trailer-fetcher.ts` calls `kumolab-yt-dlp-worker` (Render-hosted Express service, Webshare residential proxy) which streams MP4 back. FFmpeg watermark/letterbox/60s-trim via `video-processor.ts`. Used by IG Reels, FB Reels, Threads VIDEO, TikTok, YT Shorts — one bucket URL feeds all platforms.
- ⬜ **X (Twitter)** — **deferred** until revenue starts.
- ⬜ **Video generation infrastructure** — **deferred** entirely. Re-upload path covers trailers; non-trailer news skips video platforms until this is built.

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

## Phase 2 — Multi-Platform Launch ✅ Complete

**Triggered:** 2026-05-04 — tri-platform direct publishing went live. **Closed:** publishing has run consistently across Website + IG + FB + Threads (+ YouTube Shorts for edited-only) for months. The build log below is kept as reference.

**Live now:**
- ✅ Website/blog — every approved post
- ✅ Instagram — Reels (video) / image, direct API
- ✅ Facebook Page — Reels (video) / photo, direct API
- ✅ Threads — VIDEO / IMAGE / TEXT, direct API
- 🛑 TikTok — **on hold** (2026-05-13); policy-level dev-app rejection, future path is Playwright UI upload
- 🟡 YouTube Shorts — code ready, awaiting one-time OAuth consent
- ⬜ X — deferred until revenue

**Cadence:** Website uncapped; the 3 social platforms publish in lockstep via `publishToSocials()` (one cron tick = one fan-out to all 3). Min 25 min between posts via scheduler. Per-platform daily caps removed by design — spacing does the pacing.

**This phase's open work:**
- 2-week stability watch — System Health card on admin dashboard now surfaces issues at-a-glance; intervene as flagged
- ✅ Analytics page on admin dashboard — `/admin/analytics`, IG account snapshot + top posts (shipped 2026-05-04, Graph v22 unified `views` metric)
- IG/Threads/FB insights deep-dive — per-post reach/saves/shares aggregated into the dashboard analytics page (in progress)
- Announce KumoLab relaunch publicly — Jose-directed timing

### Reliability & UX hardening (2026-05-05/06)

Phase 2 traffic surfaced a cluster of issues that had been latent. Closed in one sprint:

- **Bandwidth control on yt-dlp worker** (2026-05-05) — Webshare moved to 3 GB/mo paid plan ($6.30/mo yearly). Worker pinned to 720p ceiling (`best[height<=720][ext=mp4]…`) for predictable ~25-35 MB per trailer. Mobile player clients (`youtube:player_client=android,ios,web`) added to bypass YouTube's bot-wall on Render IPs. `/info` timeout 75s → 150s + single retry on AbortError handles Render free-tier cold starts.
- **Dedup, three new layers** (2026-05-05/06) — the system was letting through:
    • Localized-title dupes (e.g. *Witch Hat Atelier* vs Japanese *Tongari Boushi no Atelier*; *Kuzuki Residence* vs *Kami no Niwa tsuki Kusunoki-tei*) where AniList didn't resolve `anime_id` and Layer 2 was silent.
    • Two different YouTube clips for the same news event (different titles → different fingerprints).
    • Watch-party content sneaking past the source-time NEGATIVE_KEYWORDS filter because the AI title formatter introduced "Watch Party" during translation, *after* the filter ran.
  Fixes: **Layer 2.5** (`extractAnimeCanonical(title)` + claim_type + 24h window) catches different sources reporting the same event. **Layer 2.6** (`extractSubtitleHash` — strip the first quoted segment, hash the rest) catches localized-title pairs that share the news subtitle word-for-word ("Episode 5 Preview Released • Airing Every Saturday"). **Layer 3 same-claim threshold** lowered from 0.55 → 0.40. **Post-translation NEGATIVE_KEYWORDS recheck** runs in `processing-worker.ts` immediately after `formatKumoLabTitle`, so AI-introduced banned phrases get caught before pending review.
- **Publisher idempotency** (2026-05-06) — `publishToSocials` now acquires a per-post advisory lock on `worker_locks` keyed `publish:{post_id}` (10-min TTL) before doing any work. Concurrent calls (Cloudflare 524 + operator retry, auto-retry firing while a manual retry is in flight, two cron ticks racing) short-circuit with `skipped_reason='lock_held'` instead of each independently creating brand-new IG/FB/Threads posts. Cause of today's Dr.STONE 3× duplicate: Meta APIs have no idempotency keys, so each `publishToSocials` call mints fresh containers; without the lock, parallel calls each landed.
- **No-screenshot-fallback rule** (2026-05-05) — when a YouTube-source post's video fetch fails, the publisher now skips socials entirely instead of degrading to a static thumbnail. Skipped posts carry `social_ids.skipped_reason='video_fetch_failed'` + `publish_attempts` counter.
- **Auto-retry for video-fetch failures** (2026-05-06) — `publishScheduledPosts` also picks up posts where `social_ids.skipped_reason='video_fetch_failed'` AND `published_at` within 6h AND `publish_attempts < 5`. Each tick bumps the counter; 5-attempt cap avoids infinite loops on permanently-broken videos. Combined with the 720p ceiling + bot-wall bypass + cold-start retry, video-fetch hiccups now self-heal within an hour with no operator action.
- **Daily Drops is website-only** (2026-05-06) — `engine.ts::publishPost` short-circuits the social broadcast for `type='DROP'` posts. The daily airing summary is a meta index, not anime news; doesn't belong on Reels.
- **Daily Drops absolute URL fix** (2026-05-05) — `generator.ts` was emitting `image: '/daily-drops-permanent.jpg'` (relative). Meta APIs reject relative URIs ("image_url is not a valid URI"). Now absolute.
- **No URLs in IG/FB/Threads captions** (2026-05-05) — replaces the broken-link issue + algorithmically downranks. FB Page Website field + bio links carry click-through; captions optimize for reach.
- **Circuit-breaker threshold 3 → 10** (2026-05-05) — with semantic dedup catching dupes pre-pending, organic decline rate is near-zero. Threshold of 3 was tripping the breaker on stale historical declines. `KUMOLAB_CIRCUIT_BREAKER_THRESHOLD=10` set on prod + preview Vercel env.
- **System Health card on admin dashboard** (2026-05-05/06) — at-a-glance red/yellow/green for 7 checks: Worker reachability, Scraper freshness, Circuit Breaker, Stuck Posts, Publish Cadence vs prior 24h baseline, Meta Token expiry, Error Rate. Each red row shows actionable next-step text. Per Jose: dashboard-only, no external alerting (Telegram/Slack/Discord) — keeps moving parts to zero.
- **Operational logs reclassified** (2026-05-05) — circuit-breaker trip events and `publisher.video-fetch` skips now write to `action_logs` (system state changes) instead of `error_logs`. The dashboard's "Errors 24h" stat now reflects actual faults.
- **Blog UX polish** — YouTube cards on `/blog` now use static thumbnail (`maxres → sd → hq` cascade with placeholder detection) + play badge instead of letterboxed live iframes that black-barred portrait/landscape mismatches. FB/Threads link bug fixed (was missing `/blog/` prefix and 404'ing on click). FB algorithm downrank avoided by removing in-caption URLs.

### Merch storefront restored (2026-05-07)

`kumolabanime.com/merch` had been empty for weeks. Root cause: `PRINTFUL_ACCESS_TOKEN` was unset on Vercel `workspace-kumolab` (lost during the rebuild cutover); `src/lib/merch.ts::getProducts()` returns `[]` when the token is missing, so the page rendered with no error and no products.

- **Single private token, full scope** — generated `KumoLab Production` at developers.printful.com via Playwright (Jose-assisted login). Expires 2028-05-05 (max 2-year window). Replaces two earlier tokens (`KumoLab DeepAgent Integration`, `KumoLabAnime`) which were deleted to avoid confusion.
- **Scopes:** view + manage on orders, store products, store files. Webhooks not granted (KumoLab doesn't use Printful webhooks). Read + write so I can hide/unhide/archive products, modify variant retail prices, upload design files, manage orders, and browse the full Printful catalog for recommendations on Jose's request.
- **Storage:** `.credentials/printful-api.md` (gitignored) holds the token + rotation runbook. Vercel env `PRINTFUL_ACCESS_TOKEN` set in Production + Preview. Production redeployed; merch page live with 6 products (Original Hoodie, Classic Hat, Cloud Hoodie, Classic Tee, Classic Backpack).
- **Future-session memory** — `memory/reference_printful_token.md` documents capabilities + storage location so future Claude sessions know they have this access without re-discovery.

### Manual upload feature (2026-05-06)

New **↑ Upload** button on `/admin/posts` next to AI Assist. Lets Jose push a video or image from his phone to the website + IG + FB + Threads in one shot — same `publishToSocials()` pipeline as automated posts, no special-casing.

- **Two-step browser flow** to bypass Vercel's 4.5 MB serverless body limit:
    1. Browser POSTs to admin-gated `/api/admin/upload-sign` → server uses service-role admin client to mint a one-time signed upload URL (filename slicing preserves `.mov` / `.mp4` / `.jpg` extension).
    2. Browser PUTs the file directly to Supabase Storage via the signed URL — bypasses storage RLS entirely; works for files up to ~100 MB.
    3. Browser POSTs the resulting public URL + caption + optional `via @creator` credit to `/api/admin/upload-and-publish`. Server creates a `posts` row, attaches `_prestagedVideoUrl` so the publisher skips its YouTube-fetch step, and routes the same MP4 through IG Reels + FB Reels + Threads VIDEO.
- **Storage bucket configs updated**: `blog-videos` accepts mp4, webm, quicktime (.mov), m4v, 3gpp, mpeg (size cap 100 MB). `blog-images` accepts png/jpeg/webp/gif/heic/heif (size cap 15 MB).
- **Storage RLS policies added** for `authenticated` role — INSERT/UPDATE/DELETE on the two media buckets. Server-issued signed URLs don't actually need this, but it's there for future flexibility.
- **Title is required**, no caption-fallback. `social_ids.staged_video_url` carries the public URL.
- **Per-platform success card** on completion — clickable links to the website + IG + FB + Threads posts; greyed-out rows for any platform that didn't take. Skipped reasons surfaced.
- **TikTok-style render across surfaces** for the staged video:
    • **Homepage (`MostRecentFeed`)**: autoplays muted+loop when the card is the snapped one; pauses when scrolled away. Center-tap toggles pause with a frosted ▶ glyph; side-tap falls through to the card link.
    • **Blog detail page (`PostBody`)**: HTML5 `<video controls autoPlay muted loop playsInline>` with max-height 85vh so portrait phone videos don't blow past the viewport.
    • **Blog card list + admin grid**: muted `<video preload="auto">` poster — Safari forced to paint first frame via `currentTime = 0.1` on `loadedmetadata` (preload="metadata" alone leaves `.mov` files black on iOS Safari).
- **Per-post idempotency lock** (above) prevents accidental dupes if Jose re-clicks publish.

---

## Phase 3 — Monetization + Growth 🟢 Active

**Trigger:** Phase 2 complete (pipeline live + stable).

**Exit condition:** First repeatable KumoLab revenue — display ads running, OR a first sponsorship closed, OR merch selling. (Monetization does NOT wait for a follower milestone.)

### Monetize now (the priority)

- **Display ads:** apply to AdSense, install the snippet on the blog. Confirm traffic, identify the gap to premium-network (Mediavine/Raptive ~50k sessions/mo) qualification.
- **Sponsorships:** one-page media kit (audience size, reach, engagement from `dashboard.ts`) + rate card + 10-target outreach list (anime brands, Crunchyroll/HIDIVE, figure/game studios). Sales drafts, Jose approves before sending. First target: 1 paid deal, then set an MRR target.
- **Merch:** store is live end-to-end (Printful + Stripe). Plan first drop, variants, cadence.

### Grow in parallel (does not gate revenue)

- Double down on top-performing formats (video-only is the proven lever: 26 → 1,600+ followers).
- Increase edited Shorts / video output — video drives growth fastest.
- Community engagement (agent drafts, Jose approves). Track weekly in `SCOREBOARD.md`.
- Reference growth checkpoint (informational, not a gate): ~10k combined followers unlocks stronger sponsor rates and premium ad networks.

---

## Phase 4 — Scale Revenue ⬜ Upcoming

**Trigger:** First repeatable revenue live (Phase 3 exit).

Scale whatever line is working: premium ad network once traffic qualifies, a repeatable sponsorship pipeline (2–3 active deals), recurring merch drops. Explore affiliate / resale and digital products. Rolls up to `GLOBAL-ROADMAP.md` Phase 2 ($5k MRR combined with Trading).

---

## Phase 5 — Maturity ⬜ Upcoming

Engines largely automated; content volume and sponsor pipeline compounding. KumoLab MRR contributing toward the global $50k goal with Jose operating as CEO, not operator.

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
- **All crons → `src/app/api/cron/route.ts`** — no parallel entry points (the old GitHub Actions detection fork was deleted 2026-07-14). Scheduled workers (see `vercel.json`): `detection`, `processing`, `publish`, `dailydrops`, `daily-report`, `cleanup`, `health-monitor`, `metrics-sync`, `refresh-meta-token`, `refresh-threads-token`. On-demand: `render`, `republish-social`, `diag-*`.
- **Source URLs belong in `sources-config.ts`** — never hardcode.
- **Retention:** posts auto-expire at `published_at + KUMOLAB_DEFAULT_RETENTION_DAYS` (default 60). Unset = evergreen.
- **Dedup:** primary via `seen_fingerprints` table. Old "anime_id + claim_type + season_label" composite is gone.
- **Meta publishing:** **direct API to all 3 platforms** — IG, FB Page, Threads. No Meta Suite cross-post dependency anywhere; the IG cross-post toggles must stay OFF (or it doesn't matter — they're orthogonal). Threads has its own separate Meta app (`KumoLab Threads`, App ID `1254048673427302`) with its own OAuth and 60-day token refreshed weekly via cron.
- **Circuit breaker:** **10** declines in 24h → auto-publish pauses for 6h (was 3, raised 2026-05-05). Manual reset via `manualResetCircuitBreaker()` or DELETE on `worker_locks` row `lock_key='auto_publish_paused'`.
- **Publisher idempotency:** every `publishToSocials` call holds a per-post advisory lock (`publish:{post_id}`, 10-min TTL). Force a republish by deleting the lock first.
- **Dedup signals (in order):** seen_fingerprints exact match → anime_id+claim → anime canonical+claim+24h → subtitle hash+claim+24h → title Jaccard (0.40 same-claim, 0.55 cross-claim).
- **No-screenshot-fallback rule:** YouTube-source posts that fail video fetch skip socials entirely. `publishScheduledPosts` retries ANY recent non-DROP published post that has no platform IDs yet (generalized 2026-07-14 from the old video_fetch_failed-only case) — up to 5 attempts within 6h. `health-monitor` (now on cron) flags posts that exhaust retries.
- Redeploy Vercel after any `vercel.json` cron changes.
- Test all cron endpoints with curl before reporting complete.

---

## KumoLab Metrics Tracker

**Revenue is the phase metric.** Followers are a growth signal, not a gate.

| Revenue line | Current | Next milestone |
| --- | --- | --- |
| Ad revenue | $0 | AdSense approved + first payout |
| Sponsorship revenue | $0 | Media kit LIVE (/media-kit); first deal closed |
| Merch revenue | $0 | First recurring drop selling |
| **KumoLab MRR** | **$0** | **First repeatable dollar** |

Audience (growth signal — refresh from live platforms; scoreboard figures go stale):

| Platform | Note |
| --- | --- |
| Instagram | Proven lever (video-only). Primary reach engine. |
| Facebook / Threads | Secondary; auto fan-out. |
| YouTube | Edited-only Shorts live; future AdSense line. |
| Website MAU | Ad-inventory + email-capture surface. |

---

*Maintained by Claude Code and the KumoLab Agent.*

*Jose has final authority over all phase transitions.*
