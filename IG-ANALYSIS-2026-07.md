# KumoLab Instagram: Performance Audit and Optimization Playbook

**@kumolabanime · 359 Reels analyzed · May-July 2026 · Fable 5 analysis (2026-07-16)**

Source data: `posts.social_metrics` (lifetime IG views/likes/comments per post), `claim_type`, `published_at`, `social_ids` (video flag). Account-level (Meta, 30d): ~361K reach, ~551K views, ~1.6K followers.

---

## 1. Executive Summary

- **Volume tripled, performance collapsed.** May: 80 posts at 6,611 avg views. June: 208 posts at 1,269. July: 659 and falling. Median stayed flat (~260) throughout. Tripling output added zero baseline reach and diluted the account. Single most important finding.
- **This is a lottery account, not a media property.** The top 10% of posts drive 83.5% of all views; top 30% drive 94%. Roughly 250 of 359 posts are dead weight that cost production effort and likely suppress distribution of the good ones.
- **The winning formula is already visible:** video (not image), big recognizable franchise, trailer or season-announcement news, posted Fri-Sun or Monday at 7-8am or 1pm ET.
- **Two whole categories should be killed or reworked:** NEW_KEY_VISUAL Reels average 41 views (median 26); image posts average 29. Algorithmically invisible.
- **Sponsor-readiness gap:** 361K monthly reach on 1.6K followers means ~99% non-followers who never return. Sponsors pay for a retained audience and reliable floors, not viral spikes. Fix the median and follow-through before raising rates.

## 2. What Is Working

- **Video, decisively.** 324 videos: 2,588 avg / 287 median. 35 images: 29 avg / 28 median. ~90x on average.
- **NEW_SEASON_CONFIRMED** = reliability engine: highest median (533, 2x account), 3,737 avg, produced the #2 all-time post (Dorohedoro S2, 97,886).
- **TRAILER_DROP** = breakout engine: all-time record (Snowball Earth PV, 339,106 views, 15,219 likes) and highest engagement (3.62%, 10x DATE_ANNOUNCED's 0.35%). Weak median (242) only because sprayed indiscriminately (n=198, >half of output).
- **DATE_ANNOUNCED** = strong p90 (6,943) for currently-airing shows, but 0.35% engagement (watch and leave).
- **Timing:** Fri (5,823 avg / 378 med), Sat (3,238 / 462), Sun (1,509 / 412) lead. Tue (192 med) + Wed (204 med) are the graveyard (129 posts, 36% of output). Hours: 7-8am ET produced the biggest breakouts; 1pm ET strong secondary.
- **Known IP** is the strongest single predictor of a breakout: Dorohedoro, Apothecary Diaries, Re:ZERO, Tokyo Revengers, Classroom of the Elite, Saga of Tanya, Wistoria.

## 3. What Is NOT Working

- **NEW_KEY_VISUAL: 41 avg / 26 median** (none of 10 broke 200). **Images: 29 avg. CAST_ADDITION: 228. OTHER: 432 avg / 155 median.**
- **Tue + Wed posting:** 129 posts (36% of output) into the two worst days.
- **Trailer spam for unknown shows:** TRAILER_DROP median 242 because the category's power is entirely conditional on the IP.
- **The single biggest problem: volume replaced curation.** May 80 posts → ~529K views; June 208 posts → ~264K. Doubling output halved total views. Every low-quality post displaces reach and buries the winners. 83.5% concentration = the account's value is ~36 posts.

## 4. Why the Top Videos Win

The four-part pattern behind every breakout:
1. **Recognizable or visually arresting IP.** Dorohedoro/Re:ZERO/Apothecary = names fans search. Snowball Earth (339K) is not established but "Double Heroine PV" is a thumbnail-stopping hook (4.5% engagement = the content grabbed people).
2. **News with stakes.** Season confirmations and trailer drops are events people share and comment on. Key visuals and cast additions are trivia. (339K trailer = 4.5% engagement; 60K air-date = 0.17%.)
3. **Video with motion in the first frame.** Reels feed rewards motion and watch time; static-visual Reels get no distribution.
4. **Proven time slots.** Top 5: Fri 8am, Mon 8am, Sat 1pm, Sat 7am, Thu 8am ET. Morning-ET catches US morning + EU midday, then compounds.

**The formula: known franchise + event-grade news + trailer footage + Fri-Mon 7-8am ET.** The account executes it ~1 time in 10.

## 5. The Core Strategic Call: Cut Volume, Raise the Floor

Tripled volume produced flat median, collapsed average, and lower absolute total views. Under a power law where 10% of posts carry 83.5% of value, adding bottom-70% posts adds nothing and subtracts distribution.

**The call: drop from ~5 Reels/day to 2-3/day, and make the pipeline reject anything that does not fit the winning template.** Freed capacity goes into making each surviving post better. Publishing bar: "would this plausibly beat 500 views?" If it is a key visual for a show with no fanbase, it does not ship (route to Stories/carousel/newsletter).

## 6. The Consistent-Performer Playbook

**Content mix (~15-20 Reels/week at 2-3/day):**
- ~45% TRAILER_DROP (known IP only) · ~30% NEW_SEASON_CONFIRMED · ~20% DATE_ANNOUNCED (currently-airing/hyped only) · ~5% OTHER (major news only).
- **Cut from Reels entirely:** NEW_KEY_VISUAL, CAST_ADDITION, all images. Key visuals become a carousel cover or Story, never a Reel.

**IP filter (score every item before queuing):**
- Tier 1 (always post, best slots): established franchises with active fanbases. Automatable proxy: has a prior season, or MAL/AniList popularity clears a threshold.
- Tier 2 (post only if footage is visually striking): new originals with a strong hook (Snowball Earth lane). Needs judgment on "would this stop a scroll."
- Tier 3 (never a Reel): obscure shows, no prior fanbase, generic footage. Source of most of the dead 70%.

**Cadence/schedule (ET):** 2-3/day max. Anchor slots 7-8am + 1pm (add 11am for a third Tier 1). Load Fri-Mon; Tue/Wed at most 1-2, urgent Tier 1 only. Requires day/slot-aware scheduling (hold non-urgent items for weekend morning slots vs publishing in arrival order).

**Format rules:** video only, motion in the first frame. First 1.5s = franchise name + stakes on screen ("DOROHEDORO SEASON 2 IS REAL"). Front-load the best trailer moment, not the studio logo. High-contrast readable overlays.

**Hooks/titles:** franchise name then event ("RE:ZERO S4: OFFICIAL TRAILER"). Event framing ("CONFIRMED", "FIRST LOOK"). End with a fandom comment prompt ("Who's been waiting since 2020?"). Pin a follow-reason comment on winners to attack the 361K-reach/1.6K-follower gap.

## 7. Numeric Targets Before Raising Sponsor Rates

| Metric | Now (30d) | Gate to raise rates | Why |
|---|---|---|---|
| Median views/Reel | 279 | **1,000+** | The floor is what a sponsor's post actually gets. |
| Avg engagement rate | ~0.8% | **2.5%+** | Proves an audience, not drive-by reach (trailers already hit 3.62%). |
| Breakouts (>25K views) | ~1/mo | **3+/mo for 3 straight months** | Consistency of upside is the premium story. |
| Dead posts (<100 views) | large share | **under 10%** | Direct measure the quality gate works. |
| Followers | 1.6K | **10K** | The threshold sponsors/media kits check; proof reach converts. |
| Total monthly views | ~187K from posts (551K account) | **500K+ from fewer posts** | Proves the volume cut reallocated, not lost, reach. |

**Measurement:** weekly rollup (median views, engagement rate, breakout count, dead-post share, trailing 30d, split by claim_type and day/hour slot). After the volume cut, expect a 1-2 week dip as the algorithm re-rates, then judge by the median. If the median has not moved after 4 weeks, the next lever is hook quality (first 1.5s), not schedule.

**Sequencing:** cut volume + kill dead categories first (pure config). Then IP-tier filter + slot-aware scheduling. Do not touch sponsor pricing until the median + breakout gates hold for a full month.
