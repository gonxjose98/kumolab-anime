# Facebook Page growth: research + plan for KumoLab

- Researched: 2026-10-10. Research only: nothing was posted, joined, or changed.
- Page: facebook.com/833836379820504 (KumoLab). Follower count not pulled (no login used).
- Method: web research (Meta newsroom, Meta Transparency Center, Meta earnings calls, trade press) + read-only Supabase pull of `posts` (social_ids, social_metrics, captions) and `daily_views`, + a read of the FB publisher (`src/lib/social/publisher.ts`).
- Evidence labels: **Official** = Meta said it, with link. **Data** = third-party study. **Folklore** = practitioner claim, unverified. **Inference** = my read.

## TL;DR

1. Facebook now hands out reach mostly by recommendation to non-followers (36.6% of US Feed views in Q2 2026 came from sources people are not connected to). A tiny Page can still get reach, but only if the Page is eligible to be recommended and the content earns comments, shares and watch time.
2. Meta's 2025 to 2026 originality rules say re-uploading content you had no role in making, or adding captions or borders to it, is unoriginal. An account that mostly posts that can be marked **non-recommendable**. KumoLab's FB history (FB-only official key visuals, anime clips with overlays) sits close to that line. That plus a near-zero follower base is the most likely reason the Page gets zero.
3. The only thing that has ever worked for us on FB is conversation inside anime Groups. Meta's own data says Groups are part of the "connected" half of Feed and group content gets recommended to non-members. So lean into Groups: participate as the Page, and start our own Group.
4. Honest call: FB is our weakest channel and Threads does 85% of views. Keep FB on cheap autopilot, run a 4-week Groups-first experiment, and make a keep/kill decision on 2026-11-07. Do not build FB-specific content beyond what the experiments need.

## 1. How Facebook distributes Page content now (sourced)

| Claim | Label | Source |
|---|---|---|
| In Q2 2026, 49.6% of US Feed views came from friends, Groups people joined, or Pages/people they follow. 36.6% came from recommendations of unconnected sources. 13.8% other. | Official | [Meta Widely Viewed Content Report, Q2 2026](https://transparency.meta.com/reports/widely-viewed-content-report/) |
| 98.9% of US Feed views in Q2 2026 had no outside link. | Official | same |
| Recommendations are ranked by predicted: time spent viewing, likelihood to share (incl. privately via Messenger/WhatsApp), like, "see more" clicks, extended video viewing, group joins, screenshot, and likelihood to dismiss. Content must pass the Recommendation Guidelines to be eligible at all. | Official | [Meta Transparency: Facebook Feed Recommendations, updated 2026-06-24](https://transparency.meta.com/features/explaining-ranking/fb-feed-recommendations) |
| Group posts are shown to non-members in a Groups feed, including groups you are not in. | Official | [Meta Transparency: Facebook Groups Feed](https://transparency.meta.com/features/explaining-ranking/fb-groups-feed/) |
| Facebook surfaced 25%+ more same-day Reels than the prior quarter; organic Feed and video views up 7% from Q4 2025 ranking work; FB video time up double digits YoY in the US. | Official | [Meta Q4 2025 earnings call, 2026-01-28](https://s21.q4cdn.com/399680738/files/doc_financials/2025/q4/META-Q4-2025-Earnings-Call-Transcript.pdf) ([Motley Fool transcript](https://www.fool.com/earnings/call-transcripts/2026/01/28/meta-meta-q4-2025-earnings-call-transcript/)) |
| Accounts that "repeatedly reuse someone else's videos, photos or text posts" lose monetization and get "reduced distribution on everything they share". Duplicates get less reach. Enhancement must be meaningful: "simply stitching together clips or adding your watermark does not qualify." Advice: captions with no links, minimal caps, max 5 hashtags. | Official | [Meta for Creators: Combating unoriginal content, 2025-07-14](https://creators.facebook.com/blog/combating-unoriginal-content); coverage [TechCrunch](https://techcrunch.com/2025/07/14/following-youtube-meta-announces-crackdown-on-unoriginal-facebook-content) |
| Original = "filmed or produced directly by" the Page owner. Unoriginal includes "re-uploading posts the Page or Profile had no role in creating", "stitching multiple clips together, or narrating what's already on screen without adding anything meaningful", and "low-value changes ... like adding borders, inserting captions". Remixes count as original only with creator presence presenting "fresh information, analysis, or substantial improvements". Repeat offenders can be "deemed non-recommendable and demonetized". Views of original Reels roughly doubled in H2 2025 vs H2 2024. | Official | [Meta Newsroom: Rewarding Original Creators on Facebook, 2026-03-13](https://about.fb.com/news/2026/03/rewarding-original-creators-on-facebook/) |
| Meta demotes Pages that repeatedly use engagement bait (react/comment/share/tag/vote bait) or unoriginal/repurposed content; repeat Pages are demoted more than single posts. Share bait = making a share the condition for a reward or proof of support. | Official | [Meta Transparency: Repeatedly posting low-quality content](https://transparency.meta.com/enforcement/taking-action/repeatedly-posting-low-quality-content/); [Types of content we demote, 2025-07-02](https://transparency.meta.com/features/approach-to-ranking/types-of-content-we-demote/) |
| Meta has tested limiting non-Meta-Verified Pages and professional-mode profiles to 2 link posts per month (from Dec 2025). Links in comments are not limited. Still described as a test. | Official test, reported by press | [Social Media Examiner, Feb 2026](https://www.socialmediaexaminer.com/what-facebooks-new-link-rules-mean-for-your-2026-strategy/); [MediaNama, Dec 2025](https://www.medianama.com/2025/12/223-meta-pay-wall-urls-facebook-posts-verified-subscribers/) |
| Pages can join Groups as the Page and can be Group admins (up to 200 groups). | Official feature, older | [Jon Loomer](https://www.jonloomer.com/pages-join-facebook-groups/); [Social Media Today](https://www.socialmediatoday.com/news/facebook-will-now-allow-pages-to-join-facebook-groups/532770/) (date of feature: not re-verified) |
| Private Groups can now go public without exposing old posts (2025-11-03). Meta launched **Forum**, a standalone Groups app, US-only, May 2026 (publicized late Sep/Oct 2026). Groups are a growing Meta priority. | Official feature, press | [TechCrunch 2025-11-03](https://techcrunch.com/2025/11/03/facebook-groups-can-now-go-public-without-exposing-members-private-posts/); [TechCrunch 2026-05-22](https://techcrunch.com/2026/05/22/meta-quietly-launches-a-new-reddit-like-app-called-forum/); [Music Ally 2026-10-02](https://musically.com/2026/10/02/meta-launches-forum-a-dedicated-app-for-facebook-groups/) |
| Facebook Content Monetization: 10K Page followers, 600K minutes viewed in 60 days, 5 active videos, original content only. Creator Fast Track pays $1K to $3K/month for 3 months to creators with 100K+ followers on IG/TikTok/YouTube. | Official (Fast Track); third-party summaries (thresholds) | [Meta Newsroom: Creator Fast Track, 2026-03](https://about.fb.com/news/2026/03/creator-fast-track-grow-your-audience-earn-money-on-facebook/); [Metricool](https://metricool.com/monetize-facebook-account/) |
| Business/brand Pages are not licensed for most popular music; Meta Sound Collection is the safe library. | Third-party, consistent with Meta's music guidelines | [Audiodrome](https://audiodrome.net/for-creators/facebook-music-copyright-rules/); [Meta: Using music in videos](https://www.facebook.com/government-nonprofits/blog/music-for-videos-on-facebook-and-instagram) |
| Format engagement on FB is flat: images 5.20%, video 4.84%, text 4.76%, links 4.43% (median, 45M+ posts across platforms). FB is "the most format-agnostic platform". | Data | [Buffer, 2026-03-19](https://buffer.com/resources/data-best-content-format-social-media/) |
| Scheduling or posting via the Graph API does not reduce reach. | Data / debunked folklore | [Metricool](https://metricool.com/does-scheduling-social-media-posts-affect-reach/) |
| Anime rights holders (Crunchyroll, Aniplex) stepped up takedowns across Meta, YouTube, TikTok in 2025 to 2026. | Third-party (law firm blog) | [Vondran Legal](https://www.vondranlegal.com/anime-copyright-crackdown-2026-what-creators-fans-and-influencers-need-to-know) |

Folklore to ignore or treat as unproven:
- "Page organic reach is 2 to 5% of followers." Widely repeated, no Meta source. Irrelevant at our size anyway.
- "Post 3+ times a day to grow a meme page." Practitioner advice ([Starter Story](https://www.starterstory.com/blog/using-memes-to-grow-to-340000-social-media-followers)). Conflicts with Meta's originality and duplicate rules when the volume is reposts.
- "Repost the top memes from big pages with credit." Explicitly what the 2025/2026 rules demote.
- "Reels get the most non-follower reach on FB." Plausible and consistent with Meta's Reels push, but the numbers floating around (engagement % by format) come from vendor blogs with no method. Treat as Weak.
- "Scheduled/API posts are penalized." Debunked (above).
- Unverifiable: whether FB treats a cross-posted IG carousel (multi-photo post) worse than a native one. No source either way.

## 2. Why our Page gets about zero (diagnosis)

Facts from our data (Supabase, read 2026-10-10):
- FB gets 1 Cloud Bank carousel/day (8-photo feed post) and the operator reels (via `/video_reels`, so they are real FB Reels). From 2026-08-31 to 2026-09-26 FB also got FB-only "INTEL" posts: official key visuals / trailer announcements (e.g. "'Overgeared' New Trailer, Key Visual", "'After War Gundam X' 30th Anniversary Key Visual"). Those have stopped since 2026-09-26.
- Per-post FB metrics in `posts.social_metrics.facebook` read likes 0 to 1, reach 0, views 0 for every post, including posts with 1 like. Reach 0 with a like is impossible, so the FB insights sync is broken (likely the missing `read_insights` permission / the Meta token problem tracked in memory, Meta data access expires 2026-10-29). `daily_views` has no facebook row at all. **We cannot currently measure FB.** Likes 0 to 1 still confirm "about zero".
- 30-day views by platform: Threads 71.2K, IG 42.1K, X 19.2K (8 days), website 261, Facebook not tracked.
- FB carousel captions: hook + "Send this to the friend who ..." every day. Reels carry 5 hashtags + a question.

Ranked causes (Inference unless noted):
1. **Possible non-recommendable status from unoriginal content.** Under the 2026-03-13 rules, our FB-only official key visuals are "re-uploading posts the Page had no role in creating". Our clip reels (anime footage + overlay + caption) can read as "low-value changes ... inserting captions" unless the voiceover adds real analysis. A Page whose output is mostly that can be marked non-recommendable, which matches "zero reach beyond a handful". Not confirmed: needs the Page status check (move 1).
2. **Cold start with no followers to seed.** Recommendations start from the people most likely to engage. With few followers and no comments, posts never earn a wider test. Our IG has 2.4K followers and still gets 8 to 78 reach per carousel; the FB Page is smaller.
3. **Content built for IG, dropped on FB.** An 8-slide 1080x1350 multi-photo post shows as a collage tile; the text slides read as small images. There is no FB-native prompt to talk. FB's ranking signals (comments, shares, time) need something to react to.
4. **Same CTA every post.** "Send this to the friend who ..." is not share bait by Meta's definition (no reward), but an identical CTA daily is the kind of pattern classifiers learn. Low risk, easy to vary.
5. **The thing that works is somewhere else.** Our only FB activity came from the owner's open questions inside Groups. That matches Meta's data: Groups sit in the connected half of Feed and get recommended to non-members. We post to the Page and talk in Groups, but the Page itself is not where the conversation is.

## 3. The plan (ranked by impact vs effort)

Measure everything in Meta Business Suite > Insights (Page: followers, reach split "followers vs non-followers", profile visits; Group: members, active members, post engagement). Until the sync is fixed, log weekly numbers by hand in a small table at the bottom of this file.

| # | Move | Impact | Effort |
|---|---|---|---|
| 1 | Page health check + fix measurement | Gate for everything | 10 min + token fix |
| 2 | Talk in Groups as the KumoLab Page | High | 0 extra (reuse the 15 to 20 min) |
| 3 | Start our own KumoLab Group, linked to the Page | High, slow | 30 min setup + 5 min/day |
| 4 | One FB-native conversation post per day | Medium | Low (templated) |
| 5 | Make FB reels "original" by Meta's definition | Medium to High | Medium |
| 6 | Adapt the carousel for FB | Low to Medium | Low |
| 7 | Spanish-language test for the Mexico audience | Unknown, possibly High | Low |

### Move 1. Page health check + fix measurement (do first)
- What: Jose opens Professional Dashboard / Meta Business Suite for the KumoLab Page and checks Page status / account status for: restrictions, "content can't be recommended" or "reduced distribution" notices, any unoriginal-content or copyright flags. Screenshot it. Separately, the Meta re-auth (already on the 10/29 list) must include `read_insights` so `social_metrics.facebook` stops reading 0.
- Why: if the Page is non-recommendable, no format change will move reach; the fix is to stop the offending content and wait it out (Meta says penalties last "a period of time").
- Measure: binary (eligible or not). Then the sync shows non-zero reach on the next carousel.

### Move 2. Talk in Groups as the KumoLab Page
- What: Of Jose's 15 to 20 min/day, put 5 to 10 min into 3 to 5 large anime Groups that allow Pages to post/comment. Switch the "interacting as" selector to KumoLab. Same playbook that already worked: open-ended questions ("What's the one anime you'd make every friend watch?", "Which fall 2026 premiere surprised you?"), and genuine replies under other people's posts. No links, no promo, no copy-paste across groups (each post written for that group, per our engagement rules).
- Why: this is the only FB activity that ever produced engagement. Doing it as the Page turns every comment into a Page impression and a one-tap follow, instead of credit to a personal profile. Fits the existing rule: act only as KumoLab.
- Caveat: some groups block Pages or ban self-promo. Pick groups where Pages already post; read the rules first.
- Measure (2 to 4 weeks): Page followers per week, profile visits from Groups, number of replies per Group post. Success: +50 followers and 5+ conversations/week by week 4.

### Move 3. Start our own KumoLab Group (linked to the Page)
- What: create a public Group (e.g. "KumoLab Anime Club: what are you watching?"), admin = the Page, linked to the Page. 3 recurring threads, no automation needed beyond reusing carousel content:
  - Mon: "What are you watching this week?" thread.
  - Wed: one carousel topic turned into a question ("We said these 6 are the most underrated action anime. What did we miss?") with 1 to 2 slides attached.
  - Sun: weekly recap thread (pairs with the Sunday recap carousel already planned).
- Invite: the people who replied to Jose's Group posts, Page followers, and a pinned "join the club" line in Page posts (no link spam).
- Why: Group posts are in the connected half of Feed, get recommended to non-members, now have a standalone app (Forum) and can be public. A Group is also the FB asset most likely to keep compounding with little posting.
- Measure: members, weekly active members, comments per thread. Success at week 4: 100 members and 10+ comments on the weekly thread. Kill if under 30 members after 4 weeks of real effort.
- Needs Jose's OK (new public surface).

### Move 4. One FB-native conversation post per day
- What: add one text or single-image post per day, FB only, written to start an argument fans enjoy. Formats: "Unpopular opinion: [take]. Agree?", "Pick one: [A] or [B]", "Name an anime with a perfect final episode", "This or that" with two key visuals side by side (our own layout, not a raw official image). No links, max 0 to 3 hashtags.
- Why: Buffer's data shows text and image posts engage as well as video on FB; comments are what get recommendations tested. This is the Page version of what worked in Groups.
- Rule: questions must be genuine, never "comment YES if ..." (comment bait is demoted).
- Measure: comments per post, reach split. Success: median 3+ comments by week 3. Cheap to automate later if it works (same pipeline as captions).

### Move 5. Make FB reels count as original
- What: for clips going to FB, the voiceover must add something not on screen: why the scene matters, a fact, a ranking, a take. "Narrating what's already on screen" does not count. Add English subtitles. 20 to 45s complete moments. Use Meta Sound Collection or original audio only on FB (brand Pages are not licensed for most popular songs). Do not post raw official trailers or unedited clips to FB at all.
- Why: Meta says original Reels views doubled in H2 2025 and that repeat unoriginal posting makes the whole Page non-recommendable. Our reels are the closest thing we have to an FB growth format, but only if they pass the originality bar.
- Measure: per-reel 3s views and non-follower share (after the sync fix). Success: any reel over 1K views with majority non-followers in 4 weeks.
- Ties to the IG plan: the zyxx_otaku experiments (plain reaction line, English subs, emotion lanes) apply here, but on FB the commentary voiceover is what buys originality.

### Move 6. Adapt the carousel for FB
- What: for FB only, lead with the single strongest art slide (no cover/title card, matches the animexronin pattern), and put the list of shows in the caption as plain text ("1. Frieren ... 6. Mushishi") followed by a genuine question ("Which one would you add?") instead of "Send this to the friend who ...". Rotate CTAs; never the same one two days running.
- Why: the FB tile shows a collage; the caption list makes the post useful without swiping, and the question gives people a reason to comment.
- Measure: comments and reach on carousels, before vs after, 2 weeks each.

### Move 7. Spanish test for Mexico
- What: 2 weeks of Spanish FB captions on the carousel (slides stay English) plus Jose spending part of the Group time in 1 to 2 large Spanish-language anime Groups (as the Page).
- Why: Mexico is one of our three top audience countries and FB is a primary social network there (general knowledge, not sourced in this pass). English-only FB posts may be wasting that audience.
- Measure: reach split by country in Page insights, comments in Spanish. Kill if no difference after 2 weeks.

## 4. Is Facebook worth the effort? (honest call)

- Not as a primary channel. Threads is 85% of views and IG is second; TikTok is restarting. FB has produced roughly nothing in months of daily posting.
- But FB costs us almost nothing to keep: the pipeline already posts. The only real cost is Jose's minutes, and he is already in FB Groups.
- Money: FB monetization needs 10K followers + 600K watch minutes in 60 days with original video. That is far away and not a reason to invest now. Creator Fast Track needs 100K+ followers elsewhere.
- Call: keep FB on autopilot, fix measurement, run moves 1 to 4 for 4 weeks (moves 5 to 7 only if they come free from other work). Decide on **2026-11-07**:
  - Keep and expand if: Page +100 followers or the Group passes 100 members, or any post/reel gets 1K+ reach with majority non-followers.
  - Otherwise: leave the auto-post running, drop the daily FB-native post, cap Jose's FB time at the Groups minutes that are fun for him, and put the effort into Threads/IG.

## 5. Experiments (2 to 4 weeks each, log results here)

| # | Test | Variant A | Variant B | Metric | Min sample |
|---|---|---|---|---|---|
| E1 | Identity in Groups | Jose comments as personal profile | Same activity as KumoLab Page | Page follows/week, replies | 2 weeks each |
| E2 | Own Group | No Group | Group with 3 weekly threads | Members, comments/thread | 4 weeks |
| E3 | Daily native post | Carousel only | Carousel + 1 question post | Comments/day, Page reach | 2 weeks each |
| E4 | Carousel CTA | "Send this to the friend who..." | Show list in caption + genuine question | Comments, shares | 7 posts each |
| E5 | Reel originality | Overlay + scene voiceover | Commentary voiceover with a fact/take + subs | 3s views, non-follower share | 6 reels each |
| E6 | Language | English caption | Spanish caption | Reach by country, comments | 7 posts each |

## 6. Things to stop

- Stop any FB-only reposts of official key visuals, trailers, or announcement art (stopped since 2026-09-26; keep it off). Highest-risk content under the 2026 originality rules.
- Stop posting raw or lightly edited clips to FB. If a reel has no added commentary, skip FB for that reel.
- Stop the identical daily CTA. Rotate, and prefer real questions.
- Stop links in FB post bodies (put them in a comment if ever needed). Links underperform and may hit the 2/month test limit.
- Stop popular licensed songs on FB reels from the Page. Use Sound Collection or original audio.
- Stop reading FB numbers from `social_metrics.facebook` until the insights sync is fixed; they are wrong (reach 0 with likes > 0).

## 7. Weekly log (fill by hand until the sync works)

| Week of | Page followers | Page reach (non-follower %) | Group members | Comments (Page + Group) | Notes |
|---|---|---|---|---|---|
| 2026-10-12 | | | n/a | | baseline |

## 8. Sources

Official (Meta):
- Meta Transparency, Facebook Feed Recommendations AI system (updated 2026-06-24): https://transparency.meta.com/features/explaining-ranking/fb-feed-recommendations
- Meta Transparency, Facebook Groups Feed AI system: https://transparency.meta.com/features/explaining-ranking/fb-groups-feed/
- Meta Widely Viewed Content Report, Q2 2026: https://transparency.meta.com/reports/widely-viewed-content-report/
- Meta for Creators, Combating unoriginal content (2025-07-14): https://creators.facebook.com/blog/combating-unoriginal-content
- Meta Newsroom, Rewarding Original Creators on Facebook (2026-03-13): https://about.fb.com/news/2026/03/rewarding-original-creators-on-facebook/
- Meta Newsroom, Creator Fast Track (2026-03): https://about.fb.com/news/2026/03/creator-fast-track-grow-your-audience-earn-money-on-facebook/
- Meta Transparency, Repeatedly posting low-quality content: https://transparency.meta.com/enforcement/taking-action/repeatedly-posting-low-quality-content/
- Meta Transparency, Types of content we demote (2025-07-02): https://transparency.meta.com/features/approach-to-ranking/types-of-content-we-demote/
- Meta Q4 2025 earnings call (2026-01-28): https://s21.q4cdn.com/399680738/files/doc_financials/2025/q4/META-Q4-2025-Earnings-Call-Transcript.pdf
- Meta, Using music in videos on Facebook and Instagram: https://www.facebook.com/government-nonprofits/blog/music-for-videos-on-facebook-and-instagram

Press / third party:
- TechCrunch, Meta crackdown on unoriginal content (2025-07-14): https://techcrunch.com/2025/07/14/following-youtube-meta-announces-crackdown-on-unoriginal-facebook-content
- Social Media Today, original creators credit: https://www.socialmediatoday.com/news/meta-adds-more-measures-to-ensure-original-creators-get-credit/814764/
- Social Media Examiner, link rules (2026-02): https://www.socialmediaexaminer.com/what-facebooks-new-link-rules-mean-for-your-2026-strategy/
- Social Media Examiner, 2026 reach rules: https://www.socialmediaexaminer.com/facebooks-2026-rules-for-reach-relevance/
- MediaNama, link paywall test (2025-12): https://www.medianama.com/2025/12/223-meta-pay-wall-urls-facebook-posts-verified-subscribers/
- TechCrunch, Groups can go public (2025-11-03): https://techcrunch.com/2025/11/03/facebook-groups-can-now-go-public-without-exposing-members-private-posts/
- TechCrunch, Meta launches Forum (2026-05-22): https://techcrunch.com/2026/05/22/meta-quietly-launches-a-new-reddit-like-app-called-forum/
- Music Ally, Forum launch (2026-10-02): https://musically.com/2026/10/02/meta-launches-forum-a-dedicated-app-for-facebook-groups/
- Jon Loomer, Pages can join Groups: https://www.jonloomer.com/pages-join-facebook-groups/
- Buffer, best content format 2026 (2026-03-19): https://buffer.com/resources/data-best-content-format-social-media/
- Metricool, scheduling does not hurt reach: https://metricool.com/does-scheduling-social-media-posts-affect-reach/
- Metricool, monetize Facebook 2026: https://metricool.com/monetize-facebook-account/
- Audiodrome, Facebook music rules: https://audiodrome.net/for-creators/facebook-music-copyright-rules/
- Vondran Legal, anime copyright crackdown 2026: https://www.vondranlegal.com/anime-copyright-crackdown-2026-what-creators-fans-and-influencers-need-to-know
- Starter Story, meme page growth (folklore example): https://www.starterstory.com/blog/using-memes-to-grow-to-340000-social-media-followers

Gaps: the web search budget ran out before I could pull case studies of specific anime FB Pages; the "what anime Pages do" section relies on the IG teardowns plus Meta's rules. Worth a follow-up teardown of 1 to 2 anime FB Pages/Groups (read-only) into `pages/`.
