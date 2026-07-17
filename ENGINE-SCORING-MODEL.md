# KumoLab Post Scoring Model (/100) — APPROVED

**Approved by Jose 2026-07-17.** The spec the engine will be wired to. Not yet implemented (design locked, build pending). Legend lives in the Engine tab ("How scoring works" popup).

## Components (sum to 100)

| Component | Max | Source |
|---|---|---|
| Franchise / Tier | 40 | `anime_tiers` via `getAnimeTierForTitle(title, studio)` |
| Video Quality | 25 | ffprobe of the fetched MP4 |
| Category | 20 | `claim_type` |
| Format | 8 | real reel vs still |
| Recency | 7 | `detected_at`, RE-SCORED as a post ages on standby |

Franchise/Tier + Video Quality = 65/100 (the two things that matter most).

## Point values

**Franchise / Tier (0-40):** Tier 1 = 40, Tier 2 = 30, Tier 3 = 20, tracked-studio-only (new original from a winner studio) = 12, untracked = 0.
**Video Quality (0-25):** 1080p+ real motion, bitrate >= 2.5 Mbps = 25; 720-1079p, 1.5-2.5 Mbps = 15; fake Ken-Burns motion on a still = 5; static image = 0; below 720p OR bitrate < 1.2 Mbps = HARD REJECT.
**Category (0-20):** trailer/PV = 20, season announcement = 17, release date/premiere = 12, key visual = 6, cast/staff = 3, other = HARD REJECT.
**Format (0-8):** true 9:16 video reel = 8, fake-motion reel = 3, static image = 1.
**Recency (0-7):** <=2h = 7, <=6h = 5, <=24h = 3, <=48h = 1, older = 0.

## Cutoffs
- **AUTO_PUBLISH: total >= 75** (+ all hard gates pass).
- **REVIEW: 55-74** (or soft-gated from auto).
- **REJECT: < 55.**

## Hard gates (override the total)
- Untracked franchise (Tier=0): never auto-publishes → REVIEW max.
- Video < 720p or bitrate < 1.2 Mbps: AUTO-REJECT regardless of total.
- Category "other": REJECT.
- Fake-motion (image-to-video) on a tiered franchise: never auto-publishes → REVIEW.
- TRAILER_DROP with no embedded video: REVIEW (existing artifact rule).

## Persistence
Store `posts.score_breakdown` (jsonb): `{ total, verdict, components:[{label,earned,max,reason}], hard_gates:[{gate,passed}] }`. The click-to-see popup on a scheduled post reads this back with no recompute.

## Selection / scheduling (Jose 2026-07-17)
- **Post EXACTLY 3x/day, one per peak slot** (`PLATFORM_DAILY_CAP.instagram = 3`; bind to the 3 `engine_config.peak_slots`). Consistency matters as much as quality: hit all 3 peak hours every day.
- **Standby backfill:** the engine keeps the 3 highest-scoring un-posted candidates on standby. Each peak slot fills with the highest-scoring candidate available at that moment (standby pool vs freshly scraped). **Highest current score wins.**
- Because recency is IN the score, standby candidates are **RE-SCORED as they age** (recency points decay), so a big Tier-1 trailer can wait a day and still beat a mediocre fresh one, but it can't sit forever (ages below the bar → drops). Example: Day 1 fills 3 slots → up to 3 leftovers held; Day 2 an 85-pt fresh video loses to a 100-pt (re-scored) standby. This enforces recency + quality + relevancy in one rule.

## Build notes
Maps onto `calculateContentScore` (add the `anime_tiers` lookup, emit the components array + total instead of the flat SCORING_WEIGHTS sum) and `decideAutoApproval` (replace `SCORE_AUTO_MIN=6` + isT1YouTube shortcut with the 75 cutoff + hard gates). Video Quality depends on the ffprobe quality gate (see ENGINE-AUDIT-2026-07.md section 4) — that probe is a prerequisite. Caveat: ensure Snowball Earth + all TOHO titles are in `anime_tiers` (Snowball Earth is Tier 1 already; TOHO has a studio-fallback) so the tier gate never down-ranks the current #1.
