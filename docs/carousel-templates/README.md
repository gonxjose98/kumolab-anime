# KumoLab carousels: Cloud Bank (LOCKED)

**Every KumoLab carousel uses the Cloud Bank theme. No exceptions, no new looks.**
The **Pop** layer (rule 2c: red accent word, gold highlighter, emoji stickers) is LOCKED too (Jose, 2026-10-16: "lock this in"). Every carousel ships with it.
Jose chose it on 2026-09-28 after reviewing 9 alternatives, and approved four
production carousels in it (Fall 2026, Same Voice, Romance, Apothecary S3).
Changing the theme is Jose's call only. Do not "refresh", restyle, or propose a
different look unprompted.

Build every carousel from `cloud-bank.js` in this folder (the shared template).
Do not copy-paste a variant or restyle one slide.

## The look (fixed)

- **Canvas:** 1080x1350 (IG 4:5). Export PNG, post JPEG quality 94, never re-encode after.
- **Layout:** official anime art on the top ~60% at full width. A row of illustrated
  clouds ("the cloud bank") crosses the art's lower edge. Text sits below on a pale sky.
- **Background:** `linear-gradient(180deg, #9FD2FF 0%, #EEF5FE 62%, #D3E6FB 100%)`.
- **Colors:** text navy `#0B2A5B`; numbers and accents amber `#D98E12` / `#E09A1E`;
  rank numbers gold `#FFD27A` with a navy outline (readable on any art).
- **Fonts:** Cormorant Garamond (headlines, lining numerals), Manrope (body and labels),
  Shippori Mincho (small Japanese accent line on covers).
- **Logo:** the REAL KumoLab logo only: `public/logo.png`, trimmed, rendered white,
  about 112px tall, top left. Never draw or type a stand-in logo.
- **Top-right pill:** a short uppercase label ("Fall 2026", "Same voice", "Save + share").
- **Footer:** slide dots bottom-left, `@kumolabanime` (or "Swipe →" on the cover) bottom-right.

## Halloween skin (Oct 25-31)

Halloween week uses the SAME layout with the locked **Lantern Night** skin: end `build.js` with
`Halloween.apply('lantern');` (from `halloween.js`, auto-loaded by render.mjs). Pill label 'Halloween'.
Chosen by Jose 2026-09-29 over 5 alternatives; the light variants were rejected as not dark enough.

## Slide structure

**Length: 5-8 slides total** (Jose, 2026-09-28: 10 is too long). Default: cover + 3-6 picks + share.

1. **Cover:** a vertical strip of 4 panels of OFFICIAL POSTER / key-visual art above
   the cloud bank, then the hook headline (serif, with one amber/italic word), a small
   Japanese line above it, and a one-line subhead.
2. **Content slides:** the hero image above the cloud bank, the gold rank number
   overlapping the art, then title, a meta line, stats in amber, "Watch on", and one
   short line of copy.
2b. **Story slides (Jose, 2026-10-16), for trend and story posts:** `story()` in `cloud-bank.js`. ONE big headline (the plot beat) plus ONE sentence, both large. No kicker, meta line, stats or "watch on". Small, sectioned text made the twist slide "look meaningless". Plain story, no insider references that need explaining (rejected: "Shigaraki is the husband now", "Pancreas girl, part two").
2c. **Pop, LOCKED on every slide type (Jose, 2026-10-16):** "all one color, one font" reads flat to low-attention viewers; every slide needs something that pops. In `story()` text, `[word]` = red accent italic with brush underline (headline, 1 per slide), `{phrase}` = bold gold highlighter (sentence, 1 per slide). Add a tilted `sticker: {icon, text, color?, ink?, side?}` on the art edge ("Red flag", "Plot twist", "Episode 2 out now"); alternate sides and colors (red, navy, gold with navy ink, pink) slide to slide. `cover`, `content` and `share` take a sticker too; `content` lines take the same markup. Per-post accent: `CloudBank.setAccent()`.
3. **Share slide (always last):** an art strip above the clouds, a question headline,
   an italic amber share prompt ("Send this to..."), and a gold "Follow @kumolabanime" button.

## Art rules

- **Big art, always** ("the more anime, the merrier"). Highest quality available.
- **Covers and share strips:** official posters (Kitsu posterImage, official sites),
  upscaled if small, with a per-panel crop position so every face is in frame. Use
  4 panels (not 6: narrow panels cut faces). Skip posters whose subjects sit at the
  far edges.
- **Content slides:** official key visuals, or 1080p frames from OFFICIAL trailers or
  clips (yt-dlp, 1 fps, then pick). Crop above burned-in subtitles; exclude
  watermarks, logos and credits.
- **Never mislabel a character.** If you can't confirm who is in a frame, don't use it.

## Copy rules

- **Slides:** short, and written like a HYPED FAN, never a synopsis. Inside references fans
  recognize, humor and emotional hooks. Good: "Return by Death? More like return by pain.
  Subaru suffers, we scream... We are not okay." Bad: "A former soldier learns what love
  means." Every claim true to the show, no spoilers beyond what's public.
- **Slide text is the content (Jose, 2026-10-16).** Titles and captions are already optimized; the words ON the slides are what keep people swiping, saving and sharing. Generic slide text is a fail. Every pick slide needs:
  1. A **kicker people would quote**, never a genre label. Bad: "PURE SEROTONIN", "BODYGUARD WITH A SPEAR". Good: "WE CRIED AT A CROSSWALK. TWICE."
  2. **One specific detail** (a moment, a number, a comparison like "if you liked X"), never an adjective pile ("gorgeous, quiet and so warm").
  3. **A save reason:** time to finish, the episode where it clicks, or "watch if you liked...".
  4. **A share reason:** a relatable line that makes someone think of a friend.
  5. **A pull to the next slide** where it fits. Trend posts tell a story that builds slide to slide and stay 100% on the trending show (no "watch next" detours).
- **Voice: we ARE fans.** Say we/us/our ("we can't stop watching", "Our Top 5"), never "fans love it" or "fans' top 5". Label stats by source ("AniList score").
- **Conviction, no hedging:** "anime that ARE masterpieces", never "anime that feel like
  a masterpiece". Hedged phrasing reads AI-generated; fans state it flat (Jose, 2026-09-29).
- **Recreating another account's post:** their idea and art choices are fine; their
  wording is never reused word for word.
- **Captions:** short. One hook line, one share call to action, 3-5 hashtags. No lists.
- **Facts** (dates, scores, voice actors, streaming) verified against 2+ sources. AniList
  voice-actor data includes young or flashback versions, so check the main role.
- No em dashes anywhere.

## Posting

- Carousels go through the KumoLab engine as `posts` rows (status `approved`,
  `image_settings.slides[].renderedUrl`, `caption_override`,
  `image_settings.captions.{facebook,threads}`) so they appear in Admin > Content >
  Schedule. The publisher sends IG carousel + FB multi-photo + Threads carousel.
- Never bunch: one post per slot, and keep the engine's auto reels off a carousel's slot.

## Files

- `cloud-bank.js`: the shared template (helpers for every element above).
- `cloud-bank-sample-frieren.html`: the first approved carousel, for reference.
- Rejected alternatives (for the record, do not reuse): v2 Sky, Sky Window, Golden Hour,
  Streaming Poster, Editorial Magazine, Manga Panels, tile-grid covers.
