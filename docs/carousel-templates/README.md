# Carousel templates

**Cloud Bank** is the locked KumoLab carousel look (Jose, 2026-09-28).

- 1080x1350. The official key art fills the top ~60% at full width and sits above a row of
  illustrated clouds. Text goes below on a pale sky gradient (`#9FD2FF` to `#EEF5FE` to `#D3E6FB`),
  in navy `#0B2A5B` with amber numbers `#D98E12`.
- Fonts: Cormorant Garamond (serif headlines, lining numerals), Manrope (body),
  Shippori Mincho (Japanese accent).
- **Logo: always the real KumoLab logo** (`public/logo.png`, trimmed of padding, rendered white over the art,
  ~112px tall, top left). Never redraw or retype it.
- Rank numbers are gold with a navy outline, so they read on any art.
- Slides: a cover (art + hook), one slide per pick (rank, title, a meta line, fan stats,
  "Watch on", a one-line pitch), and a share slide (a strip of all the art, a share prompt,
  and a Follow button).
- Art source order: Kitsu high-res poster, then Kitsu cover (landscape), then AniList
  cover. Upscale anything under ~1300px wide (Lanczos + light unsharp). Crop around
  logos and burned-in text.
- `cloud-bank-sample-frieren.html` is the working sample ("If you loved Frieren,
  watch these 5"). It expects the art in `hi/` and `logo-trim.png` next to it. The art is not committed,
  because it is official key art.
- Alternatives shown and not chosen: v2 Sky (art fading into blue), Sky Window,
  Golden Hour (a possible "special edition" variant), Streaming Poster, Editorial
  Magazine, Manga Panels.
