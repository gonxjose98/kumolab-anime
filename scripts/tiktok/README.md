# TikTok posting (Playwright, local runner)

TikTok's official API rejects first-party automation of an owned account (3 dev-app
rejections). This path drives the **real TikTok web upload page** with a saved login
session instead.

**The rule: TikTok mirrors Instagram.** Whenever a post successfully publishes to IG,
the publisher writes a row to the `tiktok_queue` table. Nothing else decides what goes
to TikTok — so TikTok automatically inherits IG's 3/day slot cadence and its video-only
policy.

**Why this runs on Jose's PC and not on a server:** the login session was captured from
this machine's IP. TikTok treats the same session appearing from a datacenter IP
(Render, Vercel, a VPS) as an account takeover, and the usual result is a silent logout
or a flagged account rather than a clean error.

> ⚠️ Automating an owned TikTok account is against TikTok's ToS and can get it flagged.
> Keep volume low. Session lives in `.credentials/tiktok-session.json` (gitignored) —
> it is equivalent to the account password. Never commit or share it.

## The pieces

| File | What it does |
|---|---|
| `tt-capture.mjs` | One-time headful login → saves the session. Re-run when it expires. |
| `tt-post.mjs` | The browser flow itself. **Fix selectors here** — both entry points share it. |
| `tt-upload.mjs` | Manual CLI, one video. For testing and one-offs. |
| `tt-runner.mjs` | The scheduled job. Drains `tiktok_queue`. This is the production path. |

## One-time setup
```bash
cd workspace-kumolab
npm i -D playwright
npx playwright install chromium
```
Then set `TIKTOK_QUEUE_ENABLED=true` in Vercel to start filling the queue. Leaving it
unset is the off switch: publishes still go to IG/FB/Threads, TikTok just queues nothing.

## Step 1 — capture the login session
```bash
node scripts/tiktok/tt-capture.mjs
```
A Chromium window opens on tiktok.com. **Log in as @kumolabanime** (do the SMS/2FA).
The script auto-detects the login, writes `.credentials/tiktok-session.json`, and closes.

Sessions expire every few weeks. When they do, the runner exits with code **2**, logs
`tiktok_session_expired` to `action_logs`, and leaves every job pending — nothing is
lost, posting just pauses until you re-run this.

## Step 2 — dry-run the queue (safe)
```bash
node scripts/tiktok/tt-runner.mjs --dry
```
Does the whole flow for each pending job except clicking Post, and leaves the jobs
pending. Check `scripts/tiktok/out/<slug>-4-dry-ready-to-post.png` to confirm the video
and caption loaded.

## Step 3 — post for real
```bash
node scripts/tiktok/tt-runner.mjs
```
Flags: `--max N` (default 3) · `--once` · `--headless` (less reliable, TikTok's bot
checks are softer on a real window) · `--dry`.

Exit codes: `0` ok or nothing pending · `1` one or more jobs failed · `2` session expired.

## Step 4 — schedule it
Task Scheduler → Create Task:
- **General:** "Run whether user is logged on or not" OFF. The browser needs a real
  desktop session; a headless-service run will fail its bot checks.
- **Triggers:** daily, repeat every 2 hours. The runner is a no-op when the queue is
  empty, so frequent checks cost nothing and keep TikTok close behind IG.
- **Actions:** Program `node`, arguments `scripts/tiktok/tt-runner.mjs`,
  Start in `C:\Users\Jose G\Workspace\workspace-kumolab`.
- **Conditions:** untick "Start only if on AC power" if this is a laptop.

## When TikTok changes its DOM
It happens every few weeks. The failing job screenshots every phase to
`scripts/tiktok/out/` — the last screenshot shows exactly where it stopped. Fix the
selectors in **`tt-post.mjs`** and both the CLI and the runner are fixed at once.

## Known gotchas
1. TikTok Studio overlays a react-joyride tour + a TUXModal that intercept clicks.
   `dismissOverlays()` clears them, and only ever clicks safe controls (Cancel / Skip /
   ×) — never "Turn on" / "Allow", so account settings are never changed.
2. A second "Continue to post? / Post now" confirmation appears while the content check
   runs. Without confirming it the upload sits in limbo and never goes live.
3. **The "Only me / Content under review" problem (July 2026) — diagnosed 2026-08-05.**
   TikTok runs a *"Content check lite"* that takes ~10 minutes. Posting while it's still
   running is what triggers the "Continue to post? / Post now" dialog, and TikTok then
   publishes the video **privately, held under review**. From the automation's side that
   looks like a clean success while nobody can see the post.
   `tt-post.mjs` now WAITS for the check to clear before clicking Post (up to
   `TIKTOK_CONTENT_CHECK_WAIT_MS`, default 12 min). That's ~10 min of runner time per
   post, which is the right trade for a background job.
   *Still to confirm with a real post:* that a check-cleared upload does land public.
4. Every caption ends in hashtags, so TikTok's hashtag autocomplete is open right when we
   go to click Post. `tt-post.mjs` dismisses it (Escape + click a neutral heading) — don't
   remove that, the dropdown covers the settings and the Post button.
5. TikTok auto-suggests a **Location** chip (it showed "Lewisboro" — Jose's town). We never
   click it, so no location is attached. Don't add location handling.
6. TikTok doesn't return the post URL at upload time (the video is still processing), so
   `tiktok_queue.tiktok_url` stays null. The row records that the post was sent, not a
   link to it.

**Timing note:** because of the content-check wait, a real run takes ~10-12 minutes per
post. Three queued posts is ~35 minutes. Set the Task Scheduler task's "Stop the task if
it runs longer than" to at least 2 hours, or it will be killed mid-post.

## Queue admin (SQL)
```sql
-- what's waiting
select slug, title, status, attempts, last_error from tiktok_queue order by created_at desc limit 20;
-- retry a failed job
update tiktok_queue set status='pending', attempts=0, last_error=null where id='…';
-- don't post this one
update tiktok_queue set status='skipped' where id='…';
```
