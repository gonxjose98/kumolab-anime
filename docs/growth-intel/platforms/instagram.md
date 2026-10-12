# Instagram: how it ranks now, why KumoLab is stuck, and the plan

- Written: 2026-10-10 (research only, no account touched)
- Builds on: [../README.md](../README.md), [../pages/zyxx_otaku.md](../pages/zyxx_otaku.md), `IG-ANALYSIS-2026-07.md`, `IG-WATCHLIST.md`. Does not repeat their findings; points at them.
- Own data used: Supabase `posts` (social_ids, published_at, slides) and `daily_views` (read-only SELECTs, 2026-10-10).
- Label key: **[Official]** = Instagram / Mosseri / Meta on the record. **[Reported]** = credible trade press reporting of an official change, primary post not opened by me. **[Folklore]** = creator/marketing claim with no primary source. **[Ours]** = our own data.

---

## 1. How the IG algorithm ranks now (sourced)

### Core signals

1. **Watch time, sends per reach, likes per reach are the top three.** Rates per viewer, not raw counts. Likes weigh a bit more for followers, sends a bit more for non-followers. [Official, Mosseri, Jan 2025, restated through 2026] ([alxo.ae summary](https://alxo.ae/whats-on/instagram-ranking-2026-signals-on-the-record/), [kompozy](https://kompozy.io/news/instagram-mosseri-ranking-signals-guidance), [dataslayer](https://www.dataslayer.ai/blog/instagram-algorithm-2025-complete-guide-for-marketers))
   - "Sends are 3 to 5x the weight of likes" is repeated everywhere but has no primary source. [Folklore]
   - "Replay rate" as a named signal and "15s watched 3x beats 60s watched once" are secondary-source paraphrases. [Folklore, directionally consistent with watch time]
2. **Each surface ranks differently.** Feed predicts time spent, carousel swipes, shares. Explore predicts follows, likes, saves, watch-through. Reels predicts early completion, shares, audio use, follows. Reels gives smaller creators "a chance to find their audience". [Official, Meta "Instagram Ranking Explained", 2023-05-31] ([about.instagram.com](https://about.instagram.com/blog/announcements/instagram-ranking-explained))
3. **Reels Instagram explicitly makes "less visible":** low resolution, watermarked, muted, **contain borders**, **majority text**, or already posted on Instagram. [Official, same 2023 page] Note: zyxx_otaku letterboxes every reel on black and still gets millions, so "borders" is not a hard block, but it is a stated negative.
4. **First seconds matter.** Mosseri: the first 3 seconds are "super important", a hook does not have to be bait. [Official, paraphrased via secondary sources] **Skip rate** (share of viewers who swipe away in the first 3s) replaced view rate in Reels insights (Aug 2025). No official "good" benchmark exists; "under 30 to 40%" is tracker folklore. ([babbleboxx](https://www.babbleboxx.com/post/instagram-adds-reels-retention-skip-rate-what-influencer-marketers-should-do-next), [retensis](https://retensis.com/blog/instagram-reels-skip-rate-benchmarks-2026))
5. **April 2026 Insights rebuild:** Overview / Engagement / Audience tabs, new share rate, skip rate, views over time, video retention chart. Does not cover trial reels or collab posts. [Reported] ([inro](https://www.inro.social/blog/instagram-insights-update))
6. **Posting more is not penalized per se.** Each post is ranked on its own. [Official per secondary sources] Our July data still says volume diluted us (IG-ANALYSIS-2026-07), which is consistent: weak posts lower our averages, they do not trigger a penalty.

### Originality (the rule most likely hitting us)

7. **2026-04-30: originality enforcement extended from Reels to photos and carousels.** Accounts that mostly post unoriginal content are no longer recommended anywhere (Feed suggestions, Explore/Discover, Reels). Followers still see them. [Reported, TechCrunch / Social Media Today / Tubefilter, all 2026-04-30] ([TechCrunch](https://techcrunch.com/2026/04/30/instagram-restricts-reach-of-content-aggregators-in-new-crackdown/), [SMT](https://www.socialmediatoday.com/news/instagram-updates-algorithm-to-benefit-original-creators/819016/), [Tubefilter](https://www.tubefilter.com/2026/04/30/instagram-removes-algorithm-recommendations-repost-content-aggregator/))
   - **Counts as original:** content you made or "materially" edited; third-party material with unique on-screen text that adds context, creative graphics with new information, remix, and per Instagram "humor, social commentary, cultural references, or a relatable take ... unique text, creative edits, and **voiceover**".
   - **Does not count:** watermarks, speed changes, screenshots crediting the source, plain reposts.
   - **Rolling 30-day assessment:** accounts where most posts in the last 30 days are reposts are classed as aggregators. [Reported, SMT] Not verified on an Instagram page.
   - "10+ reposts in 30 days removes you", "+40 to 60% reach for originals", "AI fingerprinting" are unsourced. [Folklore]
8. **Account Status shows recommendation eligibility.** Professional accounts can see whether their content or account "can't be recommended" under the Recommendation Guidelines, edit/remove flagged items and request review. Eligibility is re-evaluated as the account changes. [Official since Dec 2022] ([TechCrunch 2022](https://techcrunch.com/2022/12/07/instagrams-new-transparency-tools-will-tell-you-if-your-content-is-ineligible-to-be-recommended/)) Not verified: whether the 2026 aggregator classification itself surfaces in Account Status or is silent.

### Tools that change the playbook

9. **Trial Reels:** shown to non-followers first; not on the grid or to followers while in trial; insights at ~24h; promote or keep hidden around 72h; can auto-graduate on performance. Schedulable since early 2026. Instagram reported +80% non-follower Reels reach among users of the feature. [Official via SMT] ([SMT scheduling](https://www.socialmediatoday.com/news/instagram-allows-creators-to-schedule-trial-reels/816549/)) Not verified: support in the Graph API publishing endpoint for our account; check the current API docs before building.
10. **Carousels get a second look:** IG re-shows the next slide of a carousel someone scrolled past, and **carousels with music can appear in the Reels tab**. [Official, Mosseri, Oct 2024] ([alxo.ae summary](https://alxo.ae/whats-on/instagram-ranking-2026-signals-on-the-record/))
11. **Hashtags capped at 5 per post (Dec 2025)**; Mosseri repeatedly: hashtags help search/categorization, not reach. [Official] ([Digital Trends](https://www.digitaltrends.com/social-media/instagram-now-limits-you-to-five-hashtags-per-post/))
12. **Collab posts:** up to 5 collaborators; post shows to every collaborator's audience; Mosseri: have the larger account initiate, ranking "biases more towards the original collaborator". [Official, Mosseri Stories 2024] ([inro](https://www.inro.social/blog/instagram-collaboration-post-how-to-collab-add-after-posting-more))
13. **Meta AI voice translation for Reels:** dubs the speaker's voice (optional lip sync) into another language; English/Spanish since 2025-08, **Japanese added 2026-07-14** (also Korean, French, German, Italian). Creators over 1,000 followers, pick up to two languages per Reel, in the Reels composer, viewers hear their own language. [Official/Reported] ([Meta newsroom 2025-10](https://about.fb.com/news/2025/10/discover-reels-around-world-meta-ai-translation/), [SMT 2026-07](https://www.socialmediatoday.com/news/instagram-reels-adds-more-ai-translations/825258/)) Not verified: works on a voiceover with no face on screen (it should translate audio; lip sync is irrelevant), and whether it is available when publishing through the API (likely in-app only).
14. **Reels over 3 minutes are not recommended** in Explore/Reels tab. [Reported, secondary sources] Irrelevant now; our raw trailers were 180 to 190s, at the edge.
15. Mosseri year-end note (2025-12-31): polished perfection is out, raw and human-feeling content wins. [Reported, paraphrase only]

### Anime-specific context

- Rights holders (Aniplex, Crunchyroll, Viz via Remove Your Media) stepped up takedowns across YouTube/IG/TikTok/FB in 2026; Meta Rights Manager fingerprints audio and video. [Reported, legal blog + Dexerto] ([vondranlegal](https://www.vondranlegal.com/anime-copyright-crackdown-2026-what-creators-fans-and-influencers-need-to-know), [Dexerto](https://www.dexerto.com/youtube/anime-youtuber-says-channel-faced-deletion-after-copyright-strikes-removed-60-videos-3408486/))
- What the big clip pages do is already documented in [zyxx_otaku.md](../pages/zyxx_otaku.md): emotion lanes, English subs or English song, one reaction line, repeat shows, ~1 reel/day, synopsis captions, 5 hashtags, no collabs, reels-tab only.
- I could not verify cadence/trial-reel usage for other large anime pages this session (web search budget ran out). Gap noted.

---

## 2. Why KumoLab is stuck (diagnosis against our facts)

Ranked by how much each likely explains.

1. **We are probably not being recommended, and the cause is fixable but slow.** Reels median ~0.1x followers (zyxx: 8x). Carousels average ~34 views on 2,460 followers, i.e. they barely reach even followers. Until ~2026-10-02 the account posted raw official trailers in bursts (often 3 within 10 minutes) and image key visuals, which is the textbook "unoriginal" pattern. Since 2026-04-30 the same rule also covers carousels. If the classification is a rolling 30 days, the trailer history does not age out until **about 2026-11-02**. That would explain why the Oct 3 format change has not moved IG yet (IG daily_views: wk of 09-28 = 13.8K, wk of 10-05 = 2.3K in 6 days). [Ours + Reported] **Strength: Medium (strong circumstantial, not confirmed until we look at Account Status).**
2. **We are not actually shipping the reel plan.** IG reels published Oct 3 to 10: 7 in 8 days, zero on Oct 9 and Oct 10. Reel times were 07:35, 10:05, 12:05, 14:05, 17:35, 20:35 (no fixed slot). The plan says 2+/day at peak slots. IG cannot learn a rhythm or an audience from that. [Ours] **Strength: Strong (fact).**
3. **Reels are built for followers, not strangers.** Branded widescreen frame with borders, logo, label and serif headline; Japanese audio, no English subs; editorial hooks ("Blue Box Season 2 is now streaming"). Instagram's own list demotes borders and watermarked/branded-looking reels, and strangers swipe in the first 3s. See zyxx_otaku for the side-by-side. [Ours + Official] **Strength: Medium.**
4. **Nothing we post is built to be sent.** Shares/saves near zero, 82K-view posts earned almost no follows. News and "now streaming" posts are watch-and-leave (July data: DATE_ANNOUNCED 0.35% engagement). Sends per reach is the top signal for non-follower reach. Carousels are save-ish lists but the topics are broad ("Action anime too gorgeous..."), not aimed at one specific friend. [Ours + Official] **Strength: Medium.**
5. **We lost our anchor show and did not replace it.** Saga of Tanya made 8 of the top 12 posts Aug to Sep; that season ended. Our best recent IG post is a Mushoku Tensei reel (13.5K). New show every post means IG never learns who we are for. [Ours] **Strength: Medium.**
6. **Language mismatch with the 07:30 ET slot.** 07:30 ET is Japan evening prime, but our text and voiceover are English. Japan and Mexico viewers who get tested on a reel cannot follow it, which shows up as skips. [Ours, guess] **Strength: Weak until we see per-reel audience split.**
7. **Threads proves the topics are fine.** Same content earns 85% of our views on Threads. The gap is the IG-specific packaging (video retention, sends, originality status), not taste. [Ours]

---

## 3. The plan (ranked by expected impact vs effort)

Every move is measured the same way: weekly from IG Insights (not `posts.social_metrics`): reel median views, % of views from non-followers, share rate (sends per reach), skip rate, follows per 1K reach. Judge blocks of at least 6 posts, never single posts.

### Move 1. Check and clean recommendation eligibility (impact: gating; effort: 10 minutes + a sweep)
- Jose opens IG app > Settings > Account Status, screenshots both sections (Community Guidelines and Recommendation Guidelines / "content that can't be recommended").
- If items are flagged: remove or archive them, request review where offered.
- Regardless of the result: archive (not delete) the burst-posted raw trailer reels and image-only key visual reels from the last 30 days that got under ~100 views. Lowers the share of "unoriginal" posts in the 30-day window. This touches public posts, so Jose decides; archive is reversible.
- Hard rule going forward: every IG post carries our own layer (voiceover, reaction text that adds context, our ranking/commentary). No reposted trailers, no key-visual-only posts, no screenshots of other accounts.
- **Measure:** Account Status clean; % non-follower views on new reels rising above ~30% by early November. If still near zero after 2026-11-02 with a clean status, the cause is packaging, not eligibility.

### Move 2. Every reel goes out as a Trial Reel first (impact: high; effort: low)
- Post reels as Trial Reels (non-followers only), promote the ones that beat our median at 24 to 72h, leave the rest hidden. Use auto-graduate on performance if Jose does not want to review.
- Why: tests strangers directly (the audience we need), protects follower-facing averages, and lets us run format A/Bs without cluttering the grid. Instagram reports +80% non-follower reach among users.
- Check first whether our API publishing path supports trial reels; if not, trial reels are posted manually from the app (Jose already picks every reel, so this is ~1 minute each).
- **Measure:** trial reel 24h views vs our 236 average; promote rate; follows per 1K reach on promoted reels.

### Move 3. Rebuild the reel for strangers: watch time + sends (impact: high; effort: medium)
- Ship the plain layout already specced in zyxx_otaku experiment 1, with two KumoLab-specific changes:
  - **Keep our voice as the originality shield.** Instagram names voiceover and relatable text as what makes third-party footage original. A bare clip with one line is riskier for us than for zyxx while we may be flagged. So: plain 9:16 (or full-bleed crop rather than letterbox, since borders are an official negative), English subs on the footage, one reaction line in plain sans, plus either our ElevenLabs fan-voice reaction or a fan-voice text line that adds context. No logo, label or studio credit on screen; small watermark at most.
  - **Complete moment, 25 to 50s, motion in frame one,** payoff before the end so it loops.
- Write each hook for a send: it should finish the sentence "you have to see this, it's so you". Romance/tearjerker and comedy lanes (zyxx), plus "this scene" moments from currently airing shows.
- **Measure:** skip rate and average watch time vs current Rising Clouds reels; share rate. Win = median views 3x current and share rate visibly above zero over 6+ reels.

### Move 4. Two reels a day, fixed slots, anchor shows (impact: high; effort: low, discipline)
- Actually publish 2 reels/day: **07:30 ET and 21:30 ET** (21:30 = US evening + Mexico evening; 07:30 = our historical breakout slot + Japan evening). Carousel stays at 13:00. No two posts within 3 hours.
- Pick 2 anchor shows for the Fall 2026 season and post each 3 to 5 times a week until the season ends, with a rotating third. Candidates from our data and the watchlist: Mushoku Tensei (our best recent reel), The Apothecary Diaries S3 (Watchlist Tier 1, airing), Frieren S2, Re:Zero, Blue Box S2. Choose by which ones Jose already has clips he loves.
- Keep the reel queue 3 days deep so slots never go empty (Oct 9 and 10 had zero reels).
- **Measure:** posts shipped vs planned (target 100%); median views per anchor show across its 5th to 10th reel vs its 1st to 4th (does repetition lift the floor?).

### Move 5. Carousels: send-bait topics + music + first slide is content (impact: medium; effort: low)
- **Add a music track to every carousel** (in-app or API audio if supported). Mosseri: carousels with music can show in the Reels tab, which is the only non-follower surface our carousels can reach today.
- Topic test: aim each carousel at one specific person to send it to. "Send this to the friend who cried at Your Lie in April", "If your friend only watches shonen, these 6 will convert them", "Rank these openings, wrong answers only". Keep the Cloud Bank look (locked), change topic and slide 1.
- Slide 1 = strongest art with the hook, no title-card feel (animexronin pattern). Final slide = one-line send prompt, not a follow prompt.
- **Measure:** share rate and saves per reach per carousel; carousel views vs the 34 average. If carousels stay under ~100 views after 3 weeks with music, keep making them for Threads/X/FB (where they work) and stop treating IG carousels as a growth lever.

### Move 6. Captions written for search, not for CTA (impact: medium; effort: very low)
- Reels: 2 to 3 sentence plain synopsis naming the show, season and the two main characters (English), then 5 hashtags broad to specific (#anime #animeclips + lane tag + show + character). Drop the generic "send this to your X friend" CTA on reels; the on-screen hook does that job.
- Carousels: keep hook + share CTA (locked rule), add one line listing the show names in the post for search. Needs Jose's OK since it amends the short-caption rule.
- **Measure:** search as a traffic source in reel insights; non-follower %.

### Move 7. Meta AI translation into Spanish and Japanese (impact: medium, unproven; effort: low per reel, manual)
- On voiceover reels, publish from the app with "Translate your voice with Meta AI" set to Spanish + Japanese. Our audience is Japan / Mexico / US; this is the only native way to make one reel watchable by all three.
- Requires in-app publishing (likely not exposed in the API) and >1K followers (we qualify). Review each dub before posting.
- **Measure:** compare audience country split and watch time on 6 translated vs 6 untranslated voiceover reels.

### Move 8. Point the 15 to 20 minutes of daily engagement at the right places (impact: low-medium; effort: none extra)
- First 30 to 60 minutes after each reel: reply to every comment with a question back (conversation in our own comments).
- Remaining time: genuine early comments on the newest posts of big anime pages covering our anchor shows (fan voice, as KumoLab). Same people see our handle on the shows we are about to post about.
- After 2 to 3 weeks of consistent reels, propose 1 to 2 collab posts with similar-size anime/fan-art accounts (larger account initiates). Discuss with Jose first: it is a public, partner-facing action.
- **Measure:** profile visits and follows per week.

---

## 4. Experiments to run (in order)

Each block: 6+ posts per arm, posted in the same slots, judged at 48h and 7d. Log results in this file.

| # | Test | Arms | Primary metric | Notes |
|---|---|---|---|---|
| 0 | Account Status | none | eligibility | Do first. Blocks everything else. |
| 1 | Trial vs normal reel | trial-first vs straight publish, same clip type | non-follower views, follows | Needs API check or manual posting. |
| 2 | Plain stranger layout vs Rising Clouds | per Move 3 vs current | skip rate, watch time, share rate | Same clips both arms where possible. Supersedes zyxx exp. 1 with the voiceover twist. |
| 3 | Voiceover vs reaction text only | both in plain layout | watch time, share rate | Tells us if voiceover earns its production time. |
| 4 | Anchor repetition | same show 5x in 10 days vs one-offs | median views by order | zyxx exp. 5 applied to Fall shows. |
| 5 | Carousel with music vs without | alternate days | views, % from Reels tab | Cheapest test on the list. |
| 6 | Send-bait carousel topics vs current list topics | alternate | share rate | Keep Cloud Bank look. |
| 7 | Meta AI dub ES+JA vs none | voiceover reels only | watch time, country split | In-app publishing. |
| 8 | Synopsis caption vs hook+CTA (reels) | alternate | non-follower %, search | zyxx exp. 4. |

Order: 0, then 1+2 together (trial reels are the test vehicle for 2), then 4 and 5 in parallel, then the rest.

---

## 5. Things to stop

- Raw trailer and key-visual-only posts on IG, permanently (already paused; keep it that way).
- Posting two or more posts within minutes of each other.
- Empty reel slots and random reel times.
- Branded frame elements on reels (logo, label, borders, studio credit) for stranger-facing reels, pending test 2.
- Japanese-only audio with no English subs.
- Judging a format on one post, or judging anything before the 30-day window clears (~2026-11-02).
- Reading recent IG performance from `posts.social_metrics` (broken metrics sync); use IG Insights or the Graph API.
- Treating IG carousels as the growth engine; they are the follower/Threads/X asset unless music changes that.

## 6. Two-to-four-week targets

| Metric | Now | Week 2 | Week 4 |
|---|---|---|---|
| Reels shipped vs planned | 7 of 16 (Oct 3 to 10) | 100% | 100% |
| Reel median views (IG) | ~236 avg | 500 | 1,000 |
| % views from non-followers | unknown, likely low | measured | 40%+ |
| Share rate | ~0 | measurable on every reel | top quartile reels > 1% |
| Follows / 30 days | ~25 | 50 | 150 |
| Carousel views | ~34 | 100 with music | decide keep/demote |

---

## Sources

Official / primary
- Meta, "Instagram Ranking Explained", 2023-05-31: https://about.instagram.com/blog/announcements/instagram-ranking-explained
- Meta newsroom, Meta AI translation for Reels, 2025-10: https://about.fb.com/news/2025/10/discover-reels-around-world-meta-ai-translation/
- Meta newsroom, voice translations and fonts, 2025-11: https://about.fb.com/news/2025/11/instagram-empowers-creators-to-go-global-with-local-voice-translations-and-fonts/

Trade press reporting official changes
- TechCrunch, aggregator crackdown extends to photos/carousels, 2026-04-30: https://techcrunch.com/2026/04/30/instagram-restricts-reach-of-content-aggregators-in-new-crackdown/
- Social Media Today, original creators update (30-day assessment), 2026-04-30: https://www.socialmediatoday.com/news/instagram-updates-algorithm-to-benefit-original-creators/819016/
- Tubefilter, no recommendations for aggregators, 2026-04-30: https://www.tubefilter.com/2026/04/30/instagram-removes-algorithm-recommendations-repost-content-aggregator/
- MediaPost, 2026-05-04: https://www.mediapost.com/publications/article/414773/instagram-algorithm-update-discourages-reposted-co.html
- Social Media Today, AI translations add Japanese/Korean/French/German/Italian, 2026-07-14: https://www.socialmediatoday.com/news/instagram-reels-adds-more-ai-translations/825258/
- Social Media Today, Trial Reels scheduling, 2026: https://www.socialmediatoday.com/news/instagram-allows-creators-to-schedule-trial-reels/816549/
- TechCrunch, Account Status recommendation eligibility, 2022-12-07: https://techcrunch.com/2022/12/07/instagrams-new-transparency-tools-will-tell-you-if-your-content-is-ineligible-to-be-recommended/
- Digital Trends, 5-hashtag cap, 2025-12: https://www.digitaltrends.com/social-media/instagram-now-limits-you-to-five-hashtags-per-post/

Secondary compilations (used only where they match official statements)
- alxo.ae, signals on the record (dated list of Mosseri statements, no links): https://alxo.ae/whats-on/instagram-ranking-2026-signals-on-the-record/
- kompozy, Mosseri restates signals: https://kompozy.io/news/instagram-mosseri-ranking-signals-guidance
- dataslayer, 2026 guide (flags its own unsourced claims): https://www.dataslayer.ai/blog/instagram-algorithm-2025-complete-guide-for-marketers
- inro, April 2026 Insights update: https://www.inro.social/blog/instagram-insights-update
- inro, collab posts incl. Mosseri quote: https://www.inro.social/blog/instagram-collaboration-post-how-to-collab-add-after-posting-more
- babbleboxx / retensis, skip rate (benchmarks unofficial): https://www.babbleboxx.com/post/instagram-adds-reels-retention-skip-rate-what-influencer-marketers-should-do-next , https://retensis.com/blog/instagram-reels-skip-rate-benchmarks-2026
- Anime copyright enforcement 2026: https://www.vondranlegal.com/anime-copyright-crackdown-2026-what-creators-fans-and-influencers-need-to-know , https://www.dexerto.com/youtube/anime-youtuber-says-channel-faced-deletion-after-copyright-strikes-removed-60-videos-3408486/

Could not verify (treat as folklore until confirmed)
- Sends weigh 3 to 5x likes. "10+ reposts in 30 days" threshold. "+40 to 60% reach for originals" and "60 to 80% drops for aggregators". "Two-way conversation became a ranked signal (Mar 2026)". "Early Access Reels". Mosseri's Dec 2025 memo wording. Trial Reels and Meta AI translation availability via the Graph API. Whether the 2026 aggregator classification appears in Account Status. Cadence and trial-reel use of large anime pages other than zyxx_otaku.
