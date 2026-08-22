# KumoLab — Review → Change → Outcome Log

Every change we ship **because of an account review** is recorded here, with the
hypothesis it's testing and a slot for the measured outcome at the *next* review.
The point is to see, over time, which review-driven changes actually moved the
needle — what's working, what isn't, and what's advancing progression.

**How to use this file**
- When a review drives a change, add a row to **Active changes** with the
  hypothesis and how we'll measure it.
- At the *next* review, fill in the **Outcome** and move the entry to
  **Settled changes** (kept ✅ / reverted ↩️ / iterated 🔁).
- Keep entries terse. Link the full analysis in `.audit-YYYY-MM-DD/`.

Reviews so far: Run 1 (2026-05-08), Run 2 (2026-05-14), Run 3 (2026-06-06), Run 4 (2026-07-15).

---

## Account trajectory (snapshot each review)

| Review | Date | Followers | Posts | Median views/post | Viral (>25k) | Notes |
|---|---|---|---|---|---|---|
| Run 1 | 2026-05-08 | ~24 | 54 | 226 | 4 | May 4 MHA spike (fresh-account boost) |
| Run 2 | 2026-05-14 | ~28 | 86 | 243 | 4 | Spike decayed; "trailers broken" conclusion |
| Run 3 | 2026-06-06 | **849** | 251 | 217 | 7 | Snowball Earth (TOHO) 194k Reel → ~30× follower growth |
| Run 4 | 2026-07-15 | _(not pulled — DB run)_ | 557 | **294** (30d IG) | 4 (>25k, 60d window) | Video-only validated; new **328k** TOHO breakout; measured from DB, not Graph |

---

## Active changes (awaiting outcome at next review)

### C1 — Video-only on social (kill image posts)
- **Driven by:** Run 3 (2026-06-06) — `.audit-2026-06-06/run3-analysis.md`
- **Finding:** 3rd consecutive review that image posts are dead weight — 61 image
  posts, **median 16 views, ZERO ever cleared 1k**, while every breakout is a video Reel.
- **Change:** `src/lib/social/publisher.ts` — if no video is staged (no YouTube
  source, no operator image-to-Reel opt-in, no pre-staged MP4), skip the
  IG/FB/Threads broadcast entirely. Post still publishes to the website.
- **Hypothesis (H14):** Removing image posts from social raises median-per-post
  views and reduces feed dilution **without** hurting breakout rate (breakouts
  come from video, not images).
- **Measure at Run 4:** median views/post (expect ↑ from 217); count of
  `action_logs.action='social_publish_skipped'` w/ reason `image_only…`
  (= images correctly withheld); confirm no drop in viral/mid count.
- **Post-deploy verification (2026-06-08 02:20 UTC, ~6h after deploy):** Gate is
  **live and not leaking** — 0 image-only posts reached Instagram post-deploy
  (`imageonly_leaked_to_ig = 0`). Positive firing **not yet observed** only
  because the pipeline was near-idle overnight (1 post published in 6h, and it was
  video). Expected impact stands at ~31 image posts/week withheld (prior 7-day
  baseline: 31 of 32 non-YouTube posts had been going to IG). First `c1_skips`
  row will confirm — check at next daytime active window.
- **Outcome (Run 4, 2026-07-15):** ✅ **KEPT — proven lever.** DB measurement over 345
  IG-published posts: video median **305** views vs image/text median **27** (~11×), and the
  single biggest breakout (**328k**) is video. Gate is **airtight** — **0** image posts reached
  IG after the 2026-06-08 gate. 30-day median rose **217 (Run 3) → 294**, consistent with H14
  (removing image dead-weight lifts median without hurting breakout rate). Keep video-only.

### C2 — Wire studio-tier to publish priority (premium slots → TOHO)
- **Driven by:** Run 3 (2026-06-06)
- **Finding:** All official-studio YouTube channels share `tier: 1`, but the
  data splits hard *within* that tier — TOHO Animation produced every breakout
  (Snowball Earth 194k, Dorohedoro 88.7k, MHA 60k); Crunchyroll/Viz/Kadokawa/
  Aniplex topped out in the low thousands. `source_tier` can't see this.
- **Change:** `automation-config.ts` adds `PREMIUM_PUBLISH_STUDIOS` (seed: TOHO
  Animation) + `isPremiumStudio()`. `scheduler.ts` now gives priority-studio
  posts the premium peak-hour slots; everything else fills the off-peak pool
  first, reserving high-first-hour-engagement windows for breakout-class content.
- **Hypothesis (H13):** Routing TOHO (and future proven studios) into premium
  hours lifts their first-hour engagement and breakout odds; pushing the niche
  flood off-peak costs nothing because it doesn't break out anyway.
- **Measure at Run 4:** compare median/max views of priority-studio posts vs the
  rest; check premium-hour slots are actually going to TOHO (scheduler `reason`
  field logs "priority studio → premium"); revisit the studio list — promote any
  new breakout source, demote TOHO if it stops delivering.
- **⚠️ Post-deploy verification finding (2026-06-07):** C2 is currently
  **operationally inert.** Over the last 7 days, **61 of 61** auto-approvals went
  through the **BREAKING lane** (detected < 2h ago + a breaking claim type →
  publish +3 min), which **bypasses `findStandardSlot` entirely**. Zero posts hit
  the STANDARD lane, so the premium/off-peak reservation never fires. Worse: the
  marquee TOHO **trailers are themselves BREAKING**, so they publish immediately
  at whatever hour they're detected (possibly a dead ET hour) rather than being
  routed into premium engagement windows — the opposite of C2's intent. **Follow-up
  needed (candidate C3):** make priority-studio BREAKING posts respect premium
  hours (delay to the next premium slot when the current hour is off-peak), or
  re-decide whether instant-publish-at-any-hour is hurting breakout first-hour
  engagement. C2 code stays in (correct for any future STANDARD volume) but its
  measured impact today is ~nil.
- **Outcome (Run 4, 2026-07-15):** 🔁 **ITERATE — premise confirmed, routing not yet verifiable.**
  Two findings:
  1. **The "inert" bug is already fixed** — but by unrelated work, not a C2 patch. The
     **2026-07-09 strict-hourly rewrite** of `scheduler.ts` retired the BREAKING fast lane
     entirely; **every** auto-approved post now flows through `findStandardSlot`, and
     `preferPremium = isPremiumStudio(source)` routes TOHO → premium hours, everything else →
     off-peak pool. The bypass the audit flagged no longer exists. (Verified in code +
     caller `processing-worker.ts:396` passes `source_name`; `isPremiumStudio` substring-matches
     `"YouTube_TOHO Animation"`.)
  2. **Premise CONFIRMED:** TOHO IG-video median **637** vs other studios **274**, and TOHO owns
     the two biggest breakouts (328k, 60k). Studio-level priority is the right signal.
  3. **Routing UNVERIFIED:** **0 TOHO posts since the 07-09 rewrite**, and historically only 13%
     of TOHO landed in premium hours. Since the rewrite, premium usage is ~8% overall — expected,
     because non-TOHO deliberately takes off-peak and TOHO (which would claim premium) hasn't
     posted. **No code change this run** — the code is correct; we simply lack a post-rewrite TOHO
     sample. Watch for the next TOHO trailer and confirm it lands in a premium hour. Open strategy
     question below (C3).

---

## Run 5 (2026-08-22) — content quality, not cadence

Triggered by Jose: "the videos we are uploading are trash ... LEGO content which I
strictly BANNED ... Demon Slayer content which looks like an amateur edited it."

**Measured first.** 234 IG posts since 6/20, cross-referenced with `posts`:

- Median views flat at ~250 for nine straight weeks. The July volume cut (149 posts
  in 4 weeks to 85 in 5) moved the median 261 to 252. **Volume was never the problem.**
- Median engagement rate fell to 0.45% in the week of Aug 17. Shares are ~0 on almost
  every post, including the 67,958-view Tanya breakout (1 share).
- The account is carried by one show. Strip the Saga of Tanya the Evil episode posts
  and there is no account.

**Four root causes, all shipped fixed (commit 761f6ee + worker 82960d4, 8b1e6f1):**

- **C5a — The LEGO ban never existed in code.** It lived only in conversation, so
  "LEGO One Piece" shipped four times (2026-07-20 to 2026-08-22). Now in
  NEGATIVE_KEYWORDS as `'lego '` (trailing space: the lists are substring-matched and
  a bare `lego` swallows Beastars' Legoshi and "allegory"). Pinned by
  `banned-tie-ins.test.ts`.
- **C5b — `fb_only` was set but never read.** auto-approval flags key visuals `fbOnly`
  and processing-worker stamps `score_breakdown.meta.fb_only`; no publisher code ever
  looked at either. The image branch only caught key visuals with NO video, so when the
  "key visual" was itself a short YouTube clip it staged a video and published as an IG
  reel. Aug 11-20 shipped eight Demon Slayer character spots that way, 176-747 views and
  0-1 likes each. NEW_KEY_VISUAL / CAST_ADDITION / STAFF_UPDATE are now Facebook-only
  whatever their format.
- **C5c — No minimum video length.** Distributors publish 15-25s vertical Shorts as
  character spots with burned-in Japanese name cards. The Aniplex/Crunchyroll clips
  behind the Demon Slayer run measured 23-24s; a real teaser runs 30s+. Floor is now 30s
  (`KUMOLAB_MIN_TRAILER_SECONDS`). This is the "amateur edit" complaint's direct cause.
- **C5d — 31% of auto-approved posts never published at all.** `video_fetch_failed`,
  rising to 52% the week of Aug 15, on posts averaging 86/100 and including the highest
  scorers in the window (Cyberpunk: Edgerunners 2 teaser 90, Demon Slayer Infinity Castle
  trailers 94 x2, Tanya S2 93/97, Mushoku Tensei 87). Root cause was NOT the proxy: the
  yt-dlp worker had **no JavaScript runtime**, so it could not solve YouTube's nsig/player
  challenge and the signed media URLs returned 403 while `/info` kept working. Fixed by
  installing yt-dlp from PyPI (Alpine's package was stale) and passing `--js-runtimes node`.
  A `tv,web_safari` player_client was tried and REVERTED — it returns "The page needs to
  be reloaded." on every download.
  - **Verified:** the exact video that failed 3x on Aug 21 now returns HTTP 200,
    32.5 MB, 1920x1080 @ 2.84 Mbps — above the 720p / 1.2 Mbps gate.

**The net effect being corrected:** the feed was inverted. The best content was silently
dropped and the trivia published.

**Watch at Run 6:** median views, dead-post share, and `video_fetch_failed` rate. The
volume lever is spent; if the median has not moved once the good trailers actually
publish, the next lever is hook quality (first 1.5s) and captions, not scheduling.

---

## Settled changes

- **C1 — Video-only on social** ✅ **KEPT** at Run 4 (2026-07-15). Video median 305 vs image 27
  on IG; gate airtight (0 image→IG post-gate); 30-day median 217→294. Proven growth lever.
- **C2 — Studio-tier premium slots** 🔁 **ITERATE** at Run 4. Premise confirmed (TOHO median 637
  vs 274); the audit's "inert" bypass bug was resolved by the 07-09 strict-hourly rewrite; premium
  routing awaits a post-rewrite TOHO sample to verify. Code correct, no change.

_(Full outcome notes under each entry in Active changes above; entries stay there until the
next review supersedes them.)_

---

## Carry-forward / not yet actioned (from Run 3 recommendations)

- **C3 — Should a fresh breaking TOHO trailer wait for a premium hour?** (reframed at
  Run 4). The mechanical fix C3 originally asked for is **done**: the 07-09 strict-hourly
  rewrite already delays every post (including breaking TOHO) to the top-of-hour grid, and
  routes TOHO to premium. The *strategy* question is what's left and it's **Jose's call**:
  a breaking trailer now waits up to ~16h for the next open premium slot — is premium-hour
  placement worth that delay, or does a fresh trailer's first-hour momentum beat the slot?
  Can't answer yet — **0 TOHO posts since the rewrite**. Decision rule to gather: when the next
  TOHO trailer lands, log its scheduled ET hour + delay + first-24h views, and compare to the
  pre-rewrite instant-publish breakouts (194k/88k/60k all published at detection hour).
- **Cut cadence on the flop tail** (7–17/day → 3–5/day of curated trailers).
  Not yet shipped — needs a per-day post-count guard. Candidate for next change.
- **Caption for shareability** — lead with a one-line *concept* hook, not a
  metadata line. Prompt-level change in `ai.ts`/`prompts.ts`, not yet shipped.
- **Faster on tier-1 trailers** — detection→publish latency on TOHO uploads.
  Measure before changing.
