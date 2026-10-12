# Growth intel: master playbook

A running knowledge base of what works for big anime pages, built from teardowns of real accounts. Every pattern lists its source page(s) and how strong the evidence is. Add to it after every new analysis; do not start a new file for patterns.

Evidence strength:
- **Strong**: seen across many posts with numbers (dozens of posts, clear gap).
- **Medium**: seen consistently but small sample, or numbers only partly captured.
- **Weak**: a reasonable guess, not yet measured.

How to add a page: write `pages/<handle>.md` (numbers, examples, method), then merge its patterns below (dedupe, add the handle to the sources of an existing pattern rather than repeating it), and add a row to "Pages analyzed". Dates are absolute. No em dashes.

Data pulls: the Playwright session in `%TEMP%/kl-ig-profile` (see `scripts/carousel/ig_grab.mjs`) can open the reels tab and read play counts from IG's own page responses. Read only.

## Platform playbooks

- **Instagram** (2026-10-10): [platforms/instagram.md](platforms/instagram.md). How IG ranks now (sourced, official vs folklore), why KumoLab is stuck, ranked plan, experiments. Top 3 patterns:
  1. **Originality gates all non-follower reach.** Since 2026-04-30, accounts that mostly repost (reels, photos and carousels) are not recommended anywhere; reportedly judged on a rolling 30 days. Our own layer (voiceover, context text, commentary) is what counts as original; watermarks and credit do not. Our raw-trailer history may not age out until ~2026-11-02. Check Account Status first. Strength: Medium (official rule, our exposure unconfirmed).
  2. **Rank on watch time, sends per reach, likes per reach.** Build reels for strangers (first 3s, complete moment, no borders/branding) and every post for one specific send. Strength: Strong (Mosseri, repeated 2025 to 2026).
  3. **Use Trial Reels for every test, and music on carousels.** Trial Reels go to non-followers only; carousels with music can surface in the Reels tab. Strength: Medium (official features, untested by us).
- **Facebook** (2026-10-10): [platforms/facebook.md](platforms/facebook.md). How FB distributes Page content (sourced), why our Page gets ~0, ranked plan, keep/kill call on 2026-11-07. Top 3 patterns:
  1. **Same originality gate as IG, stated even harder.** Meta (2026-03-13): re-uploading content the Page did not make, or adding captions/borders to it, is unoriginal; repeat offenders are "non-recommendable". Our FB-only key-visual reposts (stopped 2026-09-26) and clip reels sit near that line. Check Page status first. Strength: Medium (official rule, our exposure unconfirmed).
  2. **Groups are where FB reach lives for small Pages.** About half of US Feed views come from friends, joined Groups and followed sources; group posts are also recommended to non-members. Our only FB engagement ever came from Group comments. Act in Groups as the KumoLab Page and start our own Group. Strength: Medium (official data + our only signal).
  3. **Comments and shares, not links or reposts.** FB ranks recommendations on predicted time, shares (incl. private), likes and dismissals; 98.9% of Feed views carry no link; formats engage about equally. Post genuine questions, no links, no repeated CTA. Strength: Medium (official signals, Buffer data).
- **Threads** (2026-10-10): [platforms/threads.md](platforms/threads.md). Our 95 tracked Threads posts analyzed, how Threads ranks (sourced), ranked plan, experiments. Reach is spikes (09-07, 10-01 to 10-05), not a trend; only 70 followers. Top 3 patterns:
  1. **Replies are content.** Meta: replies are "almost half of the views on Threads". In September our account views were 3x the views on our root posts, so replies or untracked posts likely drove the spikes. Reply early under big anime posts and answer every reply on ours. Strength: Medium (official stat; our cause unverified, check in-app Insights).
  2. **Feeling or big-franchise moment + one short question wins; routine news dies.** Top posts: Kaiju No. 8 new short (6,098), "Romance anime that will ruin you (nicely)" (4,463), "binge before sunrise" (1,405), Apothecary S3 premiere day (1,395). "Episode N now streaming" and one small show on repeat (Tanya, 15 posts) median under 10. Strength: Medium (n=95, heavy power law).
  3. **Write for Threads, not cross-posts.** Meta says Threads-native text beats IG cross-posts. Add text-only takes, questions and polls; keep the Threads caption to hook + question, put title lists in a self-reply, one topic tag, no hashtags. Reels median 49 views here. Strength: Medium (official guidance, our text posts untested).

## Patterns that work

### Reels

1. **Post emotion, not information.** Winning lanes are tearjerker romance (illness, disability, first kiss, reunion) and slapstick comedy. Zero news or trailers. Sources: zyxx_otaku. Strength: Strong (61 reels, median 157K; KumoLab news/trailer reels median under 300).
2. **Watchable in English with the sound off.** Footage always carries English subtitles, or the show audio is replaced by an English song over a wordless montage. Sources: zyxx_otaku. Strength: Strong for the pattern, Medium that it is causal.
3. **One line of reaction text, plain.** White plain sans on the black bar above a 16:9 clip, lowercase is fine, one or two emoji, says how to feel ("bro really...", "It hurts knowing..."). No logo, label, title or studio credit on screen; a faint watermark only. Sources: zyxx_otaku. Strength: Strong (59 of 61 identical layout).
4. **Text formulas.** Comedy: "bro really [absurd thing] 😭", "[Name] switched up real quick when [X] 😭", "She had ONE job and still fumbled it 😂", "It's [name] 😭". Romance: "She couldn't [X], but she [Y].", "Their first kiss and [name] really went for it 💗", "she knows she doesn't have much time left 💔", "Live action: / Anime:" split. Sources: zyxx_otaku. Strength: Strong (formulas behind the 5.2M, 3.99M, 1.67M, 1.28M reels).
5. **Complete moments, 35 to 55s.** A full gag or a montage arc with a payoff, not a teaser. Median 46s. Sources: zyxx_otaku. Strength: Medium.
6. **Romance-edit songs, not loud songs.** Glue Song, Washing Machine Heart, Somewhere Only We Know, A Thousand Years, reused across posts (Glue Song x3 incl. the 5.2M). Comedy keeps original dialogue audio. Sources: zyxx_otaku. Strength: Medium.
7. **Two fixed lanes, repeat the same shows.** One comedy anchor show posted nightly at a fixed time (Gintama, 20 of 61 posts, 23:10 ET, 15 of 20 over 100K) plus a rotating romance lane that milks each fresh show 5 to 9 times. Sources: zyxx_otaku. Strength: Strong.
8. **Fresh romance titles have the highest ceiling.** Current-season romances (Love Unseen Beneath the Clear Night Sky, You and I Are Polar Opposites) produced the 3.99M and 5.2M reels. Sources: zyxx_otaku. Strength: Medium.
9. **About one reel a day is enough.** Big reach came at roughly 1/day with gaps. Sources: zyxx_otaku. Strength: Medium.

### Captions (reels and carousels)

10. **Keyword-rich captions for search.** Reels: a plain 2 to 3 sentence synopsis naming the show and main characters, no CTA. Carousels: long caption with a bracketed keyword list. Both use exactly 5 hashtags. Sources: zyxx_otaku (reels), animexronin (carousels). Strength: Medium.
11. **Hashtag set: 5, broad to specific.** zyxx: #fyp #anime + one category (#romanceanime / #animeclips / #animerecomendation) + 1 to 2 show/character tags. Sources: zyxx_otaku, animexronin. Strength: Medium.

### Carousels

12. **No cover slide.** Slide 1 is already content (art), so the feed tile reads as content. Sources: animexronin (earlier analysis). Strength: Medium.
13. **Art fills the frame, two shows per slide, name + one stat.** Dense, low-text, high-value slides. Sources: animexronin (earlier analysis). Strength: Medium.
14. **Pick topics for saves and shares.** Lists people bookmark or send to a friend, not news. Sources: animexronin (earlier analysis). Strength: Medium.

## Anti-patterns

- **Raw official trailers as reels.** 180 to 190s, often 3 posted within 10 minutes. KumoLab: median under 300 plays; likely hurts recommendation eligibility (unoriginal content). Sources: kumolabanime vs zyxx_otaku. Strength: Strong that they flop, Weak that they demote the account.
- **Branded, editorial frame on clip reels.** Logo + label + serif headline + title/studio credits reads like a publisher promo. Sources: kumolabanime vs zyxx_otaku. Strength: Medium (correlation only; test pending).
- **Japanese audio with no English subs.** Sources: kumolabanime (0 of 12 sampled October frames subtitled). Strength: Medium.
- **Headline-style hook text** ("The moment Yuta entered the classroom", "Blue Box Season 2 is now streaming") instead of a viewer reaction. Sources: kumolabanime vs zyxx_otaku. Strength: Medium.
- **New show every post.** IG cannot learn an audience. Sources: kumolabanime vs zyxx_otaku. Strength: Weak.
- **Cover/title slides on carousels.** Sources: animexronin (earlier analysis). Strength: Weak.

## Open questions / to test

- Is @kumolabanime eligible for recommendation? Reels reach 0.1x followers (zyxx: 8x). Check Account Status before any format test. (2026-10-09) See platforms/instagram.md section 2 for the 30-day originality window. (2026-10-10)
- Plain clone format vs Rising Clouds on the same clips. (zyxx_otaku experiment 1)
- English song montage vs original audio for romance clips. (zyxx_otaku experiment 2)
- Nightly comedy anchor show at a fixed slot. (zyxx_otaku experiment 3)
- Synopsis caption vs hook + CTA caption. (zyxx_otaku experiment 4)
- Same show 5x in 10 days vs a new show each post. (zyxx_otaku experiment 5)
- Does posting reels to the Reels tab only (`is_in_profile_grid: false`, as zyxx does) change distribution?
- zyxx reels reporting exactly 3 likes are its flops (median 8.5K). Hidden likes or trial reels?
- Carousels: no cover slide, two shows per slide, bracketed keyword caption. (animexronin)

## Pages analyzed

| Date | Handle | Followers | Format | Key takeaway | File |
|---|---|---|---|---|---|
| 2026-10-09 | @zyxx_otaku | 19.6K | Clip reels | Emotion lanes (tearjerker romance + Gintama comedy), English subs or English song, one plain reaction line, no branding. Median 157K plays (8x followers), 7 of 102 over 1M, top 5.2M | [pages/zyxx_otaku.md](pages/zyxx_otaku.md) |
| 2026-10-08 | @animexronin | not recorded | Art carousels | No cover slide, art fills the frame, two shows per slide with name + one stat, long keyword caption + 5 hashtags, save/share topics | [pages/animexronin.md](pages/animexronin.md) |

## Account status check (2026-10-10, Jose, in-app)
All three clean: Instagram "meets all our guidelines" (recommendation eligibility OK), Facebook Page "no issues" (Recommendations: Active), Threads no flags.
So the "unoriginal repost demotion" theory in platforms/instagram.md and facebook.md is RULED OUT for now. No archiving of old trailer posts. The growth gap is content and consistency (reel volume, conversation), not a penalty.

## Field notes

- **Our own experience per platform** (2026-10-12): [platforms/experience-log.md](platforms/experience-log.md). Jose's firsthand read of TikTok, Instagram, Threads, Facebook and X with our measured numbers. Append a dated entry on every change.
