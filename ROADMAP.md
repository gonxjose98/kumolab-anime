> All agents must read [APEX.md](http://APEX.md) and [CLAUDE.md](http://CLAUDE.md) before this file.
>

> KumoLab is ACTIVE. Activated by Jose on 2026-04-20 after the previous Supabase filled up.
>

**Last updated:** 2026-04-21 | **Status:** 🔴 Active — Phase 1 awaiting production cutover (all code merged-ready on `claude/storage-rebuild`; old Supabase deleted 2026-04-21)

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

### Milestone 1.5 — Production Cutover 🟡 In motion

**Old Supabase: DELETED by Jose on 2026-04-21** (ahead of the staged teardown plan). Without the old DB, production is running against a non-existent backend until the swap completes.

Remaining manual steps (Jose):

- Swap Vercel production env vars to new Supabase (`xzoqsldtcoeaegxcdsia`) — URL + anon key + service role key + `KUMOLAB_DEFAULT_RETENTION_DAYS=60`, and remove the dead `NEXT_PUBLIC_USE_SUPABASE` var
- Merge `claude/storage-rebuild` → `main` → Vercel auto-deploys
- First-48h watch: cron logs + Supabase dashboard + admin approvals queue
- Add TikTok + YouTube credentials as they become available (optional, incremental)

Phase 5 old-Supabase teardown plan is now moot — deletion already done.

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
