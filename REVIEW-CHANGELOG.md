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

Reviews so far: Run 1 (2026-05-08), Run 2 (2026-05-14), Run 3 (2026-06-06).

---

## Account trajectory (snapshot each review)

| Review | Date | Followers | Posts | Median views/post | Viral (>25k) | Notes |
|---|---|---|---|---|---|---|
| Run 1 | 2026-05-08 | ~24 | 54 | 226 | 4 | May 4 MHA spike (fresh-account boost) |
| Run 2 | 2026-05-14 | ~28 | 86 | 243 | 4 | Spike decayed; "trailers broken" conclusion |
| Run 3 | 2026-06-06 | **849** | 251 | 217 | 7 | Snowball Earth (TOHO) 194k Reel → ~30× follower growth |

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
- **Outcome:** _TBD at Run 4_

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
- **Outcome:** _TBD at Run 4_

---

## Settled changes

_None yet — first review-driven changes (C1, C2) shipped 2026-06-06, pending Run 4._

---

## Carry-forward / not yet actioned (from Run 3 recommendations)

- **Cut cadence on the flop tail** (7–17/day → 3–5/day of curated trailers).
  Not yet shipped — needs a per-day post-count guard. Candidate for next change.
- **Caption for shareability** — lead with a one-line *concept* hook, not a
  metadata line. Prompt-level change in `ai.ts`/`prompts.ts`, not yet shipped.
- **Faster on tier-1 trailers** — detection→publish latency on TOHO uploads.
  Measure before changing.
