---
name: kumolab-carousel
description: Build, review and schedule KumoLab's daily morning Instagram/Facebook/Threads carousel in the locked Cloud Bank theme. Use when asked to make, draft, build or schedule a KumoLab carousel, the "morning post", "tomorrow's carousel", a recap / top list / recommendations / premiere carousel, or when a scheduled run asks for the next carousel.
---

# KumoLab carousel

KumoLab (@kumolabanime) posts ONE carousel every morning, in slot 1 (8:30 AM ET peak).
The bar is the Sept 29 to Oct 3, 2026 set Jose approved: Fall 2026 most anticipated,
Frieren same voice, Romance that will ruin you, Apothecary S3 starts today, Our Top 5
of 2026. **Quality over quantity, always.** If anything below can't be met, say so and
stop; never ship something weaker.

Read `docs/carousel-templates/README.md` first. It is the LOCKED spec (theme, layout,
art, copy, posting). This skill is the process; the README is the rules.

## Hard rules (Jose's, all non-negotiable)

- **Theme:** Cloud Bank only, built with `docs/carousel-templates/cloud-bank.js`. Never restyle.
- **Logo:** the real KumoLab logo (the template does this). Never draw or type one.
- **Length:** 5-8 slides: cover, 3-6 picks, share slide.
- **Art:** BIG, official, highest quality. Every face fully in frame. No burned-in
  subtitles, watermarks, printed titles/credits. Never mislabel a character: if you
  can't confirm who is in a frame, don't use it.
- **Cover/share strips:** 4 panels of OFFICIAL POSTERS (vertical strip look Jose
  prefers, not a grid), each with its own x-position so the face is centered.
- **Voice:** we ARE fans. "We", "us", "our". Never "fans love it", "fans' top 5".
- **Copy:** hype but not cringe, understandable to someone who has NEVER seen the show,
  and it must say WHY it's worth watching (we're recommending). Per pick: a 2-5 word
  bold KICKER + one or two short sentences, max ~130 chars. No insider jargon without
  context.
- **Facts:** dates, scores, studios, streaming, voice actors checked against 2+ sources.
  AniList voice-actor data includes young/flashback versions: confirm the MAIN role.
  Airtimes: label Japan broadcast times as Japan times; don't invent Crunchyroll times.
- **Captions:** short. One hook line + one share call to action + 3-5 hashtags. No lists.
- **No em dashes anywhere.**

## Process

Work in a fresh folder, e.g. `%TEMP%/kl-carousel/<date>-<slug>/` (outside the repo).
Run node scripts from the repo root so `playwright` resolves.

### 1. Pick the topic
Use the calendar in `ROADMAP.md` ("Carousel calendar"). Priorities:
1. Something happening THAT day (premiere, finale, big announcement, event).
2. The weekly rhythm: Sunday = This Week in Anime (from our feed's best performers).
3. Shareable formats: "If you loved X, watch these", "Same voice", "How to watch X in
   order", "Our top N of <season/year>" (AniList score), anniversaries.
Avoid repeating a show that led a carousel in the last 7 days (check recent `posts`
with `image_settings.slides`).

### 2. Data
AniList GraphQL (`https://graphql.anilist.co`, send `Accept` + `User-Agent` headers):
scores, popularity, dates, studios, `externalLinks` (INFO = official site, STREAMING),
`nextAiringEpisode`, characters + voiceActors, `recommendations`. Cross-check anything
time-sensitive with a web search (Crunchyroll News, Anime Corner, ANN, Japanese press).
Write the facts you'll use into `facts.md` with a source per fact.

### 3. Art
- **Posters / key visuals** (covers, share strips, and heroes when good):
  `node scripts/carousel/official_art.mjs <workdir> '{"key":"https://official-site"}'`
  then LOOK at `kv-sheet.png`. Kitsu `posterImage`/`coverImage` is a fallback. Pick
  the main visual for the CURRENT season, not an old one.
- **Character/scene frames** (hero images):
  `python scripts/carousel/trailer_frames.py search "<show> official trailer"` then
  `python scripts/carousel/trailer_frames.py grab <workdir> <videoId>...` and LOOK at
  the sheets. Official channels only.
- **Crop:** `python scripts/carousel/crop.py grid <src> <out>` to see coordinates, then
  `crop.py hero <src> img/<key>.jpg x0 y0 width` (1080x820) and
  `crop.py poster <src> img/<key>-poster.jpg [maxY]`.
- **Check every crop by viewing it.** Past failures to avoid: a face cut in half by a
  narrow panel, a printed Japanese title left in, a subtitle line, a watermark, a
  scenery-only visual with no character, an unconfirmable character.

### 4. Copy
Draft it yourself or have a Sonnet subagent write 3 options per pick (give it the rules
above, the facts, and the rejected examples in README). Pick the best, then check: new
viewer understands it? says why to watch? we-voice? true? under limits? no em dash?

### 5. Build and render
Write `<workdir>/build.js` using the template:
```js
const { cover, content, share } = CloudBank; const TOTAL = 7;
let h = cover({ label: 'Our top 5', total: TOTAL,
  strip: [['img/a-poster.jpg','48%'], ['img/b-poster.jpg','32%'], ['img/c-poster.jpg','72%'], ['img/d-poster.jpg','52%']],
  hook: { jp: '2026年 ベストアニメ', line1: 'Our Top 5 anime', line2Html: '<i>of</i> <span style="color:#E09A1E">2026</span>', sub: 'Ranked by AniList scores.' } });
h += content({ id: 's1', n: 1, total: TOTAL, label: 'Our top 5', img: 'img/a.jpg', rankNo: 1,
  title: 'Show', meta: 'Spring 2026 · Studio', stats: [['90%', 'AniList score'], ['144K', 'On AniList lists']],
  watch: 'Crunchyroll', kicker: 'Pain that pays off', line: '...' });
// ...more content slides...
h += share({ id: 's6', n: 6, total: TOTAL, strip: [...], question: '...', prompt: 'Send this to ...' });
document.getElementById('slides').innerHTML = h;
```
Then `node scripts/carousel/render.mjs <workdir>`. It fails on missing assets or a
slide count outside 5-8. **Open `sheet.png` and every slide and review them against
the hard rules.** Fix and re-render until clean.

### 6. Captions
In the workdir: `ig.txt` (hook + CTA + 3-5 hashtags), `fb.txt` (same, no hashtags),
`threads.txt` (hook + question, max 500 chars).

### 7. Approval
Send Jose the slides + captions. **Nothing is scheduled without his OK** (until he
says a format may auto-post). Apply his notes, re-render, resend.

### 8. Schedule
`python scripts/carousel/schedule.py add <workdir> <slug> "<Title>" <YYYY-MM-DD> [08:30]`
(uploads byte-for-byte, fresh file names, inserts the approved post, runs verify).
Slot 1 = 08:30 ET unless Jose says otherwise. The engine then posts IG carousel +
FB multi-photo + Threads carousel. TikTok is separate and currently off.

### 9. Before it posts
Run `python scripts/carousel/schedule.py verify` the evening before / morning of.
Opening a carousel in the admin Studio editor AUTOSAVES and has wiped titles and
swapped slides before; verify catches that. Fix via the Supabase row if needed.

## Memory

Record decisions and Jose's feedback in the project memory (and README rules if it
changes the spec). The theme, voice and length rules came from explicit feedback;
treat new feedback the same way.
