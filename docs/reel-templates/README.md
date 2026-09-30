# KumoLab reel templates (LOCKED)

Two overlay families, both approved by Jose:

1. **Full-screen "Rising Clouds"** (`fullscreen-rising-clouds.js`, 2026-09-29): for clips that fill 9:16.
   Small logo top-left, gold "0N · LABEL" (dot, never a dash-like line), 2-line white Cormorant headline
   with one gold italic word, short cloud bank rising from the bottom holding the amber date/detail.
2. **Widescreen** (`widescreen.js`, 2026-09-30): for 16:9 clips. Clip plays untouched at 1080x608, y=616.
   Themes: `day` (carousel sky) and `night` (navy + stars, clouds dimmed ~20% as one unit).
   Top clouds sit upright ON the video's top edge (never flipped, never over the picture); bottom clouds
   overlap <= ~28px so subtitles stay visible; night mist comes from `bank()` so it dissolves (no box).

Render: build a folder with `layers.js` (= widescreen.js + `window.REEL = {...}` + innerHTML), then from
the repo root `node docs/reel-templates/render-layers.mjs <folder>` -> `L-overlay.png`, and composite with
ffmpeg: `[clip]scale=1080:608,pad=1080:1920:0:616` then overlay the PNG. Keep the clip's own audio.
No em dashes anywhere.
