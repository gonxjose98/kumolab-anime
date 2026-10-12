# KumoLab social growth: field notes (our own experience)

Jose's firsthand read of each platform, with the numbers we have measured. This is OUR data, not teardown research. Add a dated entry whenever something changes; do not rewrite old entries. Times are Eastern. No em dashes.

Label key: **Jose** = his report, **Measured** = pulled from the platform or database.

## 2026-10-12 snapshot

### TikTok (strong signal: format and account both mattered)
- **Jose:** the old account was fully automated (trailer reposts) and sat at zero views for 30+ days. Since he started a new account and uploads only carousels, it is doing much better.
- **Measured (logged out, @kumolab.anime):** 7 followers, 324 likes, 10 photo carousels at 476 to 1,439 views each (avg ~650, ~6.5k total), no videos. About 13x our Instagram carousels (avg 49).
- **Related history:** old account had 15 posts restricted as "unoriginal, low-quality" (raw trailer reposts) and 0 to 5 views even on non-restricted posts. See `kumolab-platform-performance` memory.
- **Decision:** carousels only on TikTok, no raw-clip reels (Jose, 2026-10-12).
- **Open:** views are not converting to follows (7 followers on ~6.5k views). Test search-phrase first lines in captions. Find out why the 1,439 post won.

### Instagram (early spike, now flat)
- **Jose:** big growth at the start, when we were reposting trailers and posting more reels and carousels. Now carousels get basically no views.
- **Measured (30 days to 2026-10-12):** carousels avg ~49 views (16 posts); reels since 9/12 avg ~1,038 but 3 posts drive most of it. About 95% of views came from non-followers; follows are the weak spot (21 from followers, 101 from non-followers). Followers 2,431.
- **Plan (Jose):** keep 1 carousel a day and 2 reels a day on Instagram and watch how the data moves with time and growth.
- **Test running:** highlight-format reels, bare (`highlight-v1`) vs branded (`highlight-v1-branded`). First point: the bare Rem reel did 428 views, 346 reach in ~15 hours, third best of October. See `docs/reel-templates/README.md` #3.

### Threads (slow start, engagement agent helped)
- **Jose:** slow at the beginning and posts are not doing great, but they get some traction. Reels seem to do about as well as carousels, so it is roughly 50-50 and needs more data.
- **Jose:** setting up an agent to respond to all comments and engagement made a real difference. Quite a bit of growth in the last two weeks.
- **Open:** compare reels vs carousels on Threads with numbers once there is enough data.

### Facebook (weakest)
- **Jose:** weakest platform, no growth at all.
- **Prior notes:** page uploads got ~0 interactions; the only activity came from group comments. Keep/kill call is set for 2026-11-07 in `platforms/facebook.md`.

### X (moderate growth)
- **Jose:** moderate growth now that we actually post there. We have not yet been monitoring to reply to comments and engagement.
- **Open:** add the comment-and-engagement monitoring that helped Threads, and see if X growth follows.

## Takeaways so far (hypotheses, not facts)
1. Account history matters: the same platform gave 0 views on the automated account and ~650 per post on a fresh, manual, carousel-only account. Format and account state are tangled together, so we cannot say which mattered more.
2. The engagement agent is the one clear causal change we have (Threads). Worth extending to X.
3. Carousels do not work everywhere: strong on TikTok, weak on Instagram. Do not assume a format transfers between platforms.
4. Instagram reels have the best reach spikes but few follows, so conversion (bio, profile, series) is the next problem, not reach.

## Review points
- 2026-11-02: raw-trailer repost history may age off the Instagram originality window; compare reach before and after.
- 2026-11-07: Facebook keep/kill call.
- End of reel test week (~2026-10-18): bare vs branded reel results.
