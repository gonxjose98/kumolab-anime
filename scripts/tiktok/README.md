# TikTok upload via Playwright (browser automation)

TikTok's official API rejects first-party automation of an owned account (3 dev-app
rejections). This path drives the **real TikTok web upload page** with a saved login
session instead. Low-volume, human-gated.

> ⚠️ Automating an owned TikTok account is against TikTok's ToS and can get it flagged.
> Keep volume low. Session lives in `.credentials/tiktok-session.json` (gitignored) —
> never commit or share it.

## One-time setup
```bash
cd workspace-kumolab
npm i -D playwright
npx playwright install chromium
```

## Step 1 — capture your login session (you do this once, and again when it expires)
```bash
node scripts/tiktok/tt-capture.mjs
```
A Chromium window opens on tiktok.com. **Log in as @kumolabanime** (do the SMS/2FA).
The script auto-detects the login and writes `.credentials/tiktok-session.json` the
moment you're in (no Enter needed) — then closes itself.

## Step 2 — test an upload WITHOUT posting (safe)
```bash
# a local file or an https URL (e.g. one of our blog-videos MP4s)
node scripts/tiktok/tt-upload.mjs "./sample.mp4" "test caption #anime" --dry
```
`--dry` does everything except click **Post**. Check the screenshots in
`scripts/tiktok/out/` (`4-dry-ready-to-post.png`) to confirm the video + caption
loaded. TikTok's DOM shifts often, so if a step can't find its element the screenshot
shows exactly where it stopped and we refine the selectors.

## Step 3 — real post
```bash
node scripts/tiktok/tt-upload.mjs "./sample.mp4" "caption #anime #anytiktok"
```
Then verify on the @kumolabanime profile that it went live.

## Production (later)
Same as the yt-dlp worker pattern: host `tt-upload` behind a tiny service (e.g. Render)
that accepts `{ videoUrl, caption }` + a shared secret, and have the publish pipeline
POST to it for TikTok (the same watermarked MP4 that feeds IG/FB Reels). Decide hosting
+ cost after the manual flow is proven. The session file must live on that host and be
refreshed when it expires.
