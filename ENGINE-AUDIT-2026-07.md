# KumoLab Engine Audit: Scraper, Scoring, Quality

**Fable audit 2026-07-17.** How the detection/scoring pipeline actually works today, why it is not optimal for growth, and the plan to fix it. Companion to `IG-ANALYSIS-2026-07.md` (the winning formula) and `IG-WATCHLIST.md` (the tiers).

## Headline findings

1. **The tiers are not wired in.** `getAnimeTierForTitle()` exists but is called only by the admin UI, never by detection/scoring/approval/scheduling. Franchise demand (the #1 view driver) has zero weight. Central defect.
2. **Two parallel scoring systems, neither measures franchise demand.** `gradeVideoContent()` (1-10, detection) and `calculateContentScore()` (SCORING_WEIGHTS, processing) both grade "is this real news," not "does anyone watch this show."
3. **The A-F content-grader is dead weight.** `gradeContent()` is computed for the log only; `shouldAutoPublish()` is never imported. Affects no publish decision.
4. **No video-quality gate anywhere.** No ffprobe, no resolution floor, no bitrate check. Whatever the downloader returns is published, even 480p, then scaled into a soft 1080 frame. Stills get Ken-Burns'd into fake "video."
5. **Key visuals and cast still auto-publish** (grade 5-8 clears the T1 floor of 5; `CLAIM_RISK_BY_TIER` marks NEW_KEY_VISUAL AUTO at T1/T2).

## Current flow (real values)
- **Detection** (every 10 min, YT 6am-9pm ET): RSS requires a positive keyword, drops negatives, >24h; YouTube runs `gradeVideoContent` (trailer 10, PV/season 9, key visual 8, release date 8, announcement 7, cast 5, episode 3), accept if grade >= tier floor (T1>=5). Dedup by fingerprint + semantic + Jaccard 0.55.
- **Processing**: `calculateContentScore` (source authority 1-5, content type flat 4 for trailer/season/keyvisual/date, video = +2 YouTube bonus, recency 1-2, penalties). Thresholds PUBLISH_MIN 6, HIGH_CONF 7.
- **Auto-approval**: artifact gate, score<6 to review, `claimRisk` matrix, isT1YouTube+score>=7 shortcut (how TOHO trailers auto-publish), else AniList + corroboration + tone.
- **Schedule**: one top-of-hour slot; `isPremiumStudio` (hardcoded TOHO string) gets premium hours; caps all Infinity.

## Why it is not optimal
- Franchise demand weight 0 (tiers unused).
- Format underweighted: video +2 of ~13 ceiling, yet video outperforms image 90x.
- Categories flat: trailer = season = key visual = date = 4.
- Source authority coarse: all T1 = 5 though only TOHO breaks out; the TOHO fix is applied to scheduling only, hardcoded.
- Over-measures "real news," never measures reach potential.
- Dead/legacy: content-grader, CONTENT_CLASSIFICATION/classifyContent/VERIFICATION_TIERS, stale intelligence-config channel lists.

## The fix (to be rescaled to /100 for Jose's approval)
Unified score consuming `anime_tiers`: Franchise/Tier (dominant), Category (un-flattened: trailer/season high, key-visual/cast near-zero), Format (real video required, no fake-motion bonus), Video Quality (resolution/bitrate/real-motion), Recency. Auto-publish only when tracked-franchise + real video + right category + high total; untracked gated to review; <720p auto-reject.

**Video-quality gate:** request 1080p (never <720p) via yt-dlp format string; post-download ffprobe (height/bitrate/framerate); reject <720p or slideshow-like; persist `video_height`/`bitrate`/`quality_tier`; stop faking motion from stills for franchise posts. Enforce in `trailer-fetcher.fetchYouTubeToBucket`.

## Prioritized recommendations
- **P1** Wire `anime_tiers` into scoring + the auto-publish gate (structural, highest impact).
- **P2** Cut volume (config: `PLATFORM_DAILY_CAP.instagram` Infinity → 3). **Jose decided: 3x/day, one per peak slot.**
- **P3** Un-flatten category weights + demote key-visual/cast (config + `CLAIM_RISK_BY_TIER`).
- **P4** Add the ffprobe + worker-format quality gate.
- **P5** Replace hardcoded `isPremiumStudio` TOHO string with tier-driven premium slotting.
- **P6** Require real video for franchise reels; curtail image-to-video fake motion.
- **P7** Delete dead code; consolidate the two scoring functions into one.

**Caveat:** Snowball Earth (the #1 performer) is an untracked original but IS in Tier 1, and TOHO has a studio-fallback in `getAnimeTierForTitle`, so P1 will not down-rank it. Keep verified when wiring.

## Plan (Jose, 2026-07-17)
Tonight: design + approve the /100 scoring model. After: architect and WIRE everything properly, tiers + sources + scoring + peak slots all connected, plus per-post score visible on scheduled posts with a click-to-see breakdown popup. Deploy only after the full architecture is right. Fix all the currently-unwired elements.
