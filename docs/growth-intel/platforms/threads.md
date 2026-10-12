# Threads: what works for @kumolabanime and the plan (late 2026)

- Written: 2026-10-10
- Method: read-only. Supabase `posts` (95 posts with a `threads_id`, 2026-08-11 to 2026-10-10, per-post Threads views/likes synced 2026-10-10), `daily_views` (account-level Threads views per day), `monthly_metrics` (follower counts). Public Threads profile pages fetched logged-out. Meta docs, Meta creator pages and press coverage fetched 2026-10-10. No account was touched.
- Not possible this run: pulling replies-level insights via the Threads API (token use was blocked), and web search (session search budget was used up), so third-party coverage is thinner than planned. Gaps are flagged.

## TL;DR

1. **Our Threads reach is spikes, not a trend.** The 30-day total (about 70K) is mostly two bursts: 2026-09-07 (24,535 views in one day) and 2026-10-01 to 10-05 (about 52K). Outside bursts the account does 200 to 600 views a day. Since 2026-10-06 it has fallen back hard (373, 195, 1,113) and the last four carousels have 0 to 7 views each.
2. **Most of that reach does not come from our tracked root posts.** September: account views 37,046 vs 11,817 on our posts. The 09-07 spike day had our posts at 3 to 33 views. Official Meta number: replies are "almost half of the views on Threads". Most likely source: Jose's replies or an untracked post. Confirm in the app (move 1).
3. **Reach is not turning into followers.** Threads followers: 40 (end Jul), 56 (end Aug), 59 (end Sep), 70 (2026-10-10). About 11 follows from about 50K views in October.
4. **Our winners share one shape:** a big or very current franchise, or a universal feeling ("ruin you", "binge before sunrise"), with a short hook caption. The losers are routine news (episode X now streaming), the same small show over and over (Tanya, 15 posts, median about 6 views), and captions that list six titles.
5. **The plan:** add native text posts (takes, questions, polls), move the reply habit to Threads first, rewrite carousel captions for Threads, post weekly-episode reactions within hours of the drop, and fix measurement so we can see which replies and posts make the spikes.

## 1. What is working for us now (our data)

### Account level (daily_views, platform = threads)

| Period | Threads views | Note |
|---|---|---|
| Aug 2026 | 13,418 (posts: 13,235) | Account total roughly equals the sum of post views |
| Sep 2026 | 37,046 (posts: 11,817) | 24,535 of it on Mon 09-07 alone |
| 10-01 to 10-05 | 13,435 / 18,441 / 9,714 / 3,660 / 6,540 | The burst behind "+129%" |
| 10-06 to 10-09 | 835 / 373 / 195 / 1,113 | Back to baseline or below |

- Followers (monthly_metrics, and 70 on the public profile 2026-10-10): tiny. The 30-day views figure overstates how big the account is.
- Definition caveat: Meta's API docs call the user-level `views` metric "the number of times your profile was viewed" ([Threads Insights docs](https://developers.facebook.com/docs/threads/insights)). Our August numbers match the sum of post views almost exactly, so in practice it seems to behave like content views. Treat the definition as **unverified** until it is checked against the in-app Insights screen.
- Older posts are missing: posts before 2026-08-11 have no `threads_id`. The public profile shows a 2026-08-06 "Firefly Wedding Premieres October 9" post with 407 likes, 34 reposts, 37 shares. That matches the 08-06 spike (5,169), so a strong root post can do it too.

### Post level (95 tracked root posts)

| Format | Posts | Median views | Mean | Best | Posts at 200+ |
|---|---|---|---|---|---|
| News/trailer video (INTEL, Aug to Sep) | 73 | 51 | 219 | 6,098 | 24 |
| Cloud Bank carousel (from 09-29) | 12 | 58 | 638 | 4,463 | 3 |
| Operator reel (from 09-29) | 10 | 49 | 84 | 255 | 2 |

Heavy power law: the top 4 posts make up 55% of all tracked views.

| Rank | Post | Views | Likes | What it has |
|---|---|---|---|---|
| 1 | Kaiju No. 8 Part 2 recap short (Fri 09-25 14:05 ET, video) | 6,098 | 139 | Big franchise, official new short, Friday midday |
| 2 | "Romance Anime That Will Ruin You (Nicely)" carousel (Thu 10-01 08:35) | 4,463 | 87 | Universal feeling, plain one-line hook + "Which one made you cry first?" |
| 3 | "Anime you can binge before sunrise" carousel (Tue 10-06) | 1,405 | 15 | A clear use case (one-night binge), short hook + question |
| 4 | "Apothecary Diaries S3 starts today" carousel (Fri 10-02) | 1,395 | 38 | Day-of premiere of a big fall show |
| 5 | Kaiju No. 8 short "Hasegawa, I Forgot My Wallet" (Fri 09-18 22:35) | 631 | 30 | Same franchise again, comedy short |
| 6 | My Happy Marriage special teaser (Tue 09-01 14:05) | 592 | 28 | Romance franchise |
| 7 | Re:Zero S4 teaser (Mon 09-28 08:35) | 580 | 17 | Big franchise |

Losers and dead categories:
- **Saga of Tanya the Evil**: 15 posts, median about 6 views. "Episode N now streaming" type posts: almost all under 10.
- **Repeat announcements** (Iruma-kun S4 announced, 4 times: 6 to 207).
- **Reels on Threads**: median 49, best 255. Clip reels are not our Threads lever.
- **Carousel captions that list every title** (10-05 onward: 41, 7, 3, 0). Weak evidence: it overlaps with the account-wide drop after 10-06.

Timing (news posts only, small samples, Medium-to-weak evidence):
- Midday slot (13:00 to 15:00 ET) median 68 vs morning 16 vs night 40.
- Friday median 184 vs 13 to 68 on other days. Two of the top 5 posts were Fridays.

**Patterns (ours):**
- P1. Known franchise or a big current show, timely (premiere day, a new official short), beats routine news. Strong for "routine news flops", Medium for the rest.
- P2. A feeling or a use case as the hook ("ruin you", "before sunrise") beats a genre label ("action anime too gorgeous..."). Medium (n=12 carousels).
- P3. One short hook line plus one easy question. No list of titles in the Threads text. Medium-to-weak.
- P4. Reach comes in bursts we cannot explain from root posts, so replies or untracked posts likely drive it. Medium (math gap is strong, the cause is unverified).

## 2. How Threads ranks content (sourced)

### Official (Meta)

| Claim | Source, date |
|---|---|
| For You is ranked by predictions: how likely you are to like a post, scroll past it, reply, click it, open the author's profile and then another post, plus time spent on the post and on its permalink page. Signals cover viewer behavior from the past hour to 84 days, media type, device and location. | [Meta Transparency: Threads feed system card](https://transparency.meta.com/features/explaining-ranking/ig-threads-feed/), updated 2025-03-07 |
| "Replies account for almost half of the views on Threads." Replying to others helps you "make new connections and gain new followers." | [Instagram Creators: Threads best practices](https://creators.instagram.com/threads) (based on H1 2024 data) |
| "Higher post frequency is linked to higher views per post", so post at least 2 to 5 times a week. | same |
| Media posts with text "performed significantly better than posts without any text." | same |
| "Top-performing creators post original content to Threads"; cross-posting from IG/FB is fine to start, but "creating text-based content specifically for Threads is a better strategy." | same |
| Topic tags help "reach more people who are interested in that topic." One topic tag per post. `topic_tag` is preferred over hashtags in the text. | same; [Threads API posts docs](https://developers.facebook.com/docs/threads/posts) |
| Communities (launched 2025-10-02, 100+ at launch, 200+ by 2025-12) are built on topic tags. Community posts show up in For You and Following too. Members post without adding the tag by hand. | [TechCrunch 2025-10-02](https://techcrunch.com/2025/10/02/threads-takes-on-x-with-new-communities-feature/), [TechCrunch 2025-12-15](https://techcrunch.com/2025/12/15/threads-adds-new-communities-tests-badges-for-highly-engaged-members/) |
| "Champion" badges (test) go to people "highly followed in the community and who converse actively." | TechCrunch 2025-12-15 |
| Viewers can now steer their own feed by topic: "Dear Algo" public posts (2026-02-11, 3-day effect) and private "Your Algo" (2026-06, 1/3/7 days). Communities out of beta with a Discovery Hub. Connor Hayes: "When folks use the app with a clear purpose and find their people quickly, it's just a better experience." | [TechCrunch 2026-02-11](https://techcrunch.com/2026/02/11/threads-new-dear-algo-ai-feature-lets-you-personalize-your-feed/), [TechCrunch 2026-06-16](https://techcrunch.com/2026/06/16/threads-adds-new-personalization-and-community-features-as-it-reaches-500m-monthly-users/) |
| Scale: 400M MAU (2025-08), 500M MAU (2026-06). Ahead of X in daily mobile users (141.5M vs 125M, 2026-01). | TechCrunch [2025-08-12](https://techcrunch.com/2025/08/12/threads-now-has-more-than-400-million-monthly-active-users/), 2026-06-16, [2026-01-18](https://techcrunch.com/2026/01/18/threads-edges-out-x-in-daily-mobile-users-new-data-shows/) |
| Live Chats (2026-04, up to 150 active chatters), at first for a small group of creators. Meta names "TV show finales" as a use case. All communities by July 2026. | [TechCrunch 2026-04-22](https://techcrunch.com/2026/04/22/threads-is-adding-live-chats-to-boost-real-time-engagement/), 2026-06-16 |

Tools the API now supports (all usable by our publisher; [API changelog](https://developers.facebook.com/docs/threads/changelog)): polls (2025-04-14), text-only posts (2025-06-04), topic tag (2025-07-14), GIFs (2025-10-17; GIPHY only from 2026-03-31), spoiler tags and text attachments for long text (2025-10-03), reply audience controls (2025-07-07), reply approvals (2026-02-13), sharing Threads posts to IG Stories (2026-03-25), carousels of 2 to 20 items, max 5 links per post.

What the official sources imply:
- Replies are first-class content. A good reply under a big post is distributed like a post and can bring profile taps and follows.
- Getting replies matters. "Likely to reply" and time spent reading replies on the permalink are both in the model, so posts that start conversations travel.
- Text written for Threads beats IG cross-posts.
- Topic or community fit is now a bigger lever, because viewers steer their feeds by topic.

### Folklore and third-party (treat with care)

- "Replies boost engagement 42%" (Buffer, 128K posts). Cited in [Buffer's 2026-01-26 algorithm piece](https://buffer.com/resources/threads-algorithm/) without the method. Unverified.
- "Threads chronological Following feed" is described by Buffer. The Following feed exists, but Meta's system card covers ranking for the mixed feed. Do not plan around chronology.
- "Text-only beats images on Threads" is widely repeated by creators. Meta's own line says media *with text* beats media without text. That is not a text-vs-media verdict. **Unverified: test it (experiment E1).**
- "Engagement bait gets demoted" (for example "comment YES"). Not stated for Threads in the sources we could reach. Keep questions genuine anyway.
- The `views` metric definition: see the caveat in section 1.

### What other anime accounts do (logged-out sample, 2026-10-10, weak evidence)

- @crunchyroll (1.4M followers) posts clips and captions like "Nami can never stay mad at Usopp" and gets 100 to 300 likes per post. That is very low for its size. Publisher-style clip posting does not scale on Threads even with a giant following.
- The anime search tab is dominated by people talking: "looking for anime friends" intro posts (one got 280 likes and 85 replies), recommendation requests, and "anime name?" questions. Reply counts are often near or above like counts. Threads anime culture is conversational.
- Not captured: a proper teardown of a fast-growing anime fan account on Threads. Do this next with the growth-intel method (`pages/<handle>.md`).

## 3. The plan (ranked by impact vs effort)

| # | Move | Impact | Effort |
|---|---|---|---|
| 1 | Find what made the spikes, and fix measurement | High (stops guessing) | Low |
| 2 | Add 2 native text posts a day (take, question, poll) | High | Low |
| 3 | Threads-first reply habit, aimed at big fresh posts in Anime Threads | High | Low (same 15 to 20 min) |
| 4 | Rewrite carousel text for Threads, and put the titles in a first self-reply | Medium-high | Low |
| 5 | Weekly-episode reaction posts within 2 hours of the drop, with spoiler tags | Medium-high | Medium |
| 6 | Cut dead news categories; keep only big-franchise, day-of posts | Medium | Low |
| 7 | Turn reach into follows: profile, pinned post, a recurring series | Medium | Low |
| 8 | Test show-specific topic tags vs the fixed "Anime Threads" | Medium | Low |

### Move 1. Find what made the spikes, and fix measurement (do first, this week)
- In the Threads app (Jose, 5 min, read only): Insights > Views. Check the top content for 2026-09-07 and 2026-10-01 to 10-05, and whether they were replies, quotes or untracked posts. Also check Settings > Account status for any recommendation limits, because of the drop since 10-06.
- Write the answer here. If replies made the spikes, move 3 becomes move 1.
- Proposed build (needs Jose's OK, not done here): store KumoLab's own replies (`/me/replies` + insights) in a table, and snapshot post views at 24h and 72h, so a post is not judged on whatever the sync saw last.

### Move 2. Native text posts: 2 a day on Threads only
- Publish through the existing API path (text-only posts are supported). Use the 13:00 slot and a new late slot about 21:30 ET. Keep the carousel in the morning.
- Mix (fan voice, "we", no neutral synopsis):
  - Hot take with a stake: "Apothecary Diaries S3 is better than S1 and it isn't close. Fight us." (one sentence, one opinion)
  - Easy question that anyone can answer in 3 words: "First anime that made you cry. Go."
  - This-or-that and polls (API `poll_attachment`): "Better comfort rewatch: Frieren or Spy x Family?"
  - "Name the anime from one bad description" (good for replies)
- Rules: under 200 characters, no hashtags in the text, one topic tag, no link. Reply to the first 10 replies within the first hour.
- Why: Meta says Threads-native text beats cross-posts, and the model rewards replies and time spent in replies. Our audience is too small to win on reach alone, so we have to start conversations.

### Move 3. Threads-first reply habit
- Put at least 10 of the 15 to 20 minutes into Threads, because it is 85% of our views. Raise Threads from 5 to 10 replies a day by making them shorter. Same rules as now: only as KumoLab, genuine, no automation.
- Targets: posts under 60 minutes old from large anime accounts (Crunchyroll, studio and official show accounts, big fan accounts) and the Anime Threads community feed. An early reply sits higher in the thread.
- Reply style that earns profile taps: a specific opinion or a fact in one or two sentences, in fan voice. The existing examples on our profile ("Protecting them from a distance still meant Gohan grew up without him...") are the right tone. Avoid "Great post!".
- On our own posts: answer every reply in the first 2 hours. Reply chains are views and conversation signals.
- Optional, after 2 weeks of consistency: join the Anime Threads community in the app (Jose) so posts carry it, and aim for the "Champion" badge (highly followed + converses actively).

### Move 4. Carousel text written for Threads
- Keep the Cloud Bank slides as they are. Change only the Threads text (`image_settings.captions.threads`).
- Format: a feeling or use-case hook + one personal question. No list of titles in the text. Example: "Romance anime that will ruin you (nicely) 💔 Which one made you cry first?" (4,463 views)
- Put the title list in a **first self-reply** posted right after (API `reply_to_id`). That keeps the main post clean, makes the post a conversation, and gives search the show names.
- Topic choice for carousels: feelings and use cases (cry, binge tonight, short and finished, comfort rewatch) over genre labels ("action anime too gorgeous"). This matches the IG playbook pattern "pick topics for saves and shares".

### Move 5. Weekly episode reactions (the Threads version of "post what people feel")
- For 3 or 4 big fall 2026 shows we already follow (Apothecary Diaries S3, Blue Box S2, Firefly Wedding, plus whichever is trending), post one text reaction within 2 hours of each simulcast: "Episode 2 of Apothecary Diaries and Maomao just [moment] 😭 who else screamed". Spoilers go behind the spoiler tag.
- Same show every week, same time. This gives viewers a reason to follow and fits how people use Threads ("keep up with what's happening right now", Meta 2026-02).
- Effort: someone (or the ingest pipeline) has to know the episode dropped. Draft fast; pick with Jose.

### Move 6. Cut dead news, keep big-franchise moments
- Stop: "Episode N now streaming", repeat "Season X announced" for the same show, character visual drips for one show.
- Keep: day-of premieres and new official shorts or trailers for top franchises (Kaiju No. 8, Re:Zero, Apothecary, Demon Slayer). Post those as a 1-line fan reaction + the clip, not a headline.
- Reels on Threads: keep cross-posting if it costs nothing, but stop judging Threads by them (median 49).

### Move 7. Turn reach into follows
- Bio: say what a follower gets and when: "Anime recs every morning + episode reactions every week ☁️". Edit by Jose (public-facing, his call).
- Pin the best-performing carousel (Romance, 4,463) so people who tap our profile from a reply see the best thing first.
- Recurring named series so a follow has a promise: "Morning rec" (carousel) and "Episode night" (reactions).

### Move 8. Topic tag test
- Today every post uses "Anime Threads" (`THREADS_TOPIC_TAG`). Test a show tag (for example "Apothecary Diaries") on episode reactions and premiere posts. Fans who follow the show may beat the generic community. Needs a per-post tag field (small code change, Jose's OK).

### How to measure (2 to 4 weeks, from 2026-10-12)

Weekly, every Monday, logged here:

| Metric | Now (baseline) | 4-week target |
|---|---|---|
| Threads followers (API `followers_count`) | 70 | 150+ |
| Median views per root post (all formats, measured at 72h) | about 50 | 200+ |
| Median daily account views excluding spike days (over 5K) | about 300 | 800+ |
| Replies received per post (median) | about 0 | 3+ |
| Views from our replies (in-app, until tracked) | unknown | known |
| Posts at 1K+ views per week | about 1 | 3+ |

Read the result by format: text vs carousel vs reel vs news. Kill what stays under 50 views median after 2 weeks.

## 4. Experiments

| # | Test | Setup | Read after | Win if |
|---|---|---|---|---|
| E1 | Text-only vs carousel | Same topic: text question at 13:00 vs carousel at 08:35, 10 pairs | 2 weeks | Text median views and replies at least match the carousel |
| E2 | Titles in caption vs titles in a first self-reply | Alternate days on carousels | 2 weeks | Self-reply version has higher views and replies |
| E3 | Poll vs open question | 6 each, same slot | 2 weeks | Higher replies + views |
| E4 | Episode reaction timing | Within 2h of the drop vs next morning | 3 weeks (3 episodes) | Within 2h wins on views |
| E5 | Show topic tag vs "Anime Threads" | Alternate on episode and premiere posts | 3 weeks | Show tag gets higher median views |
| E6 | Carousel slot 08:35 vs 13:00 ET | Alternate weeks | 2 weeks | Midday wins (news posts already hint at it) |
| E7 | Reply volume | 5/day vs 10/day on Threads, a week each | 2 weeks | More follows and profile views in the 10/day week |

Run 2 or 3 at a time, not all 7.

## 5. Things to stop

- Routine news on Threads: "episode N now streaming", repeat announcements, one small show over and over (Tanya).
- Listing six titles in the Threads text. Move them to a self-reply.
- IG-style share CTAs on Threads ("Send this to your movie night crew"). Use a question that is easy to answer.
- Hashtag blocks in Threads text. One topic tag only.
- Judging Threads by the 30-day views total. Track followers and baseline views without spikes, or we will chase noise.
- Expecting reels to carry Threads.

## 6. Sources

Official / primary:
- Meta Transparency Center, Threads feed ranking system card (updated 2025-03-07): https://transparency.meta.com/features/explaining-ranking/ig-threads-feed/
- Instagram Creators, Threads best practices (H1 2024 data, fetched 2026-10-10): https://creators.instagram.com/threads
- Threads API Insights docs (metric definitions): https://developers.facebook.com/docs/threads/insights
- Threads API Posts docs (topic tag, limits): https://developers.facebook.com/docs/threads/posts
- Threads API changelog (2025 to 2026 features): https://developers.facebook.com/docs/threads/changelog

Press (reporting Meta announcements):
- TechCrunch 2025-08-12, 400M MAU: https://techcrunch.com/2025/08/12/threads-now-has-more-than-400-million-monthly-active-users/
- TechCrunch 2025-09-25, algo tagging prototype: https://techcrunch.com/2025/09/25/threads-is-developing-a-tool-that-lets-you-tag-its-algorithm-to-configure-your-feed/
- TechCrunch 2025-10-02, Communities: https://techcrunch.com/2025/10/02/threads-takes-on-x-with-new-communities-feature/
- TechCrunch 2025-12-15, 200+ communities, Champion badges: https://techcrunch.com/2025/12/15/threads-adds-new-communities-tests-badges-for-highly-engaged-members/
- TechCrunch 2026-01-18, Threads passes X in daily mobile users: https://techcrunch.com/2026/01/18/threads-edges-out-x-in-daily-mobile-users-new-data-shows/
- TechCrunch 2026-02-11, Dear Algo: https://techcrunch.com/2026/02/11/threads-new-dear-algo-ai-feature-lets-you-personalize-your-feed/
- TechCrunch 2026-04-22, Live Chats: https://techcrunch.com/2026/04/22/threads-is-adding-live-chats-to-boost-real-time-engagement/
- TechCrunch 2026-06-16, 500M MAU, Your Algo, Communities Discovery Hub (Connor Hayes quotes): https://techcrunch.com/2026/06/16/threads-adds-new-personalization-and-community-features-as-it-reaches-500m-monthly-users/

Third-party (unverified methods):
- Buffer, Threads algorithm (2026-01-26): https://buffer.com/resources/threads-algorithm/
- Hootsuite, Threads algorithm (2024-04-17, dated): https://blog.hootsuite.com/threads-algorithm/

Our data: Supabase project xzoqsldtcoeaegxcdsia, tables `posts`, `daily_views`, `monthly_metrics` (read 2026-10-10). Public profiles: threads.com/@kumolabanime, threads.com/@crunchyroll, threads.com/search?q=anime (logged out, 2026-10-10).

Gaps to close next run: Mosseri and Hayes statements on reply ranking and on how cross-posted content is treated (search budget ran out); a teardown of a growing anime fan account on Threads; replies-level data from the API.
