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
| `tt-enqueue.ts` | Manually queue a post: `npx tsx scripts/tiktok/tt-enqueue.ts <slug>` or `--latest`. Reuses the IG caption, so a hand-queued job matches an automatic one. |
| `run-tt-runner.cmd` | What Task Scheduler actually executes. Timestamps each run into `out/runner.log`. |
| `tt-status.mjs` | Reads the content manager and reports each recent post's privacy / review state. Exits 3 if anything is private. |

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

## Step 4 — the schedule (already set up)

Task **"KumoLab TikTok Runner"** is registered on Jose's PC: daily from 07:00, repeating
every 2 hours, 3-hour execution limit, `IgnoreNew` so two runs can't overlap and
double-post. It runs `run-tt-runner.cmd`, which logs to `out/runner.log`.

```powershell
Get-ScheduledTask -TaskName "KumoLab TikTok Runner"          # state
Get-ScheduledTaskInfo -TaskName "KumoLab TikTok Runner"      # last result + next run
Start-ScheduledTask -TaskName "KumoLab TikTok Runner"        # run it now
Get-Content scripts\tiktok\out\runner.log -Tail 40           # what happened
```

It runs as an **interactive** task on purpose ("run whether user is logged on or not" is
OFF): the browser needs a real desktop session, and a headless service run fails TikTok's
bot checks. **The PC has to be awake and logged in at trigger time.** Missed runs aren't
lost — jobs stay pending and go out on the next trigger.

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
3. **The "Only me / Content under review" problem (July 2026) — RESOLVED 2026-08-05, it
   was a false alarm.** Measured on a real post: TikTok holds a fresh upload as
   *"Only me / Content under review"* for roughly 10 minutes, then **flips it to Everyone
   by itself**. Nothing is wrong and nothing needs fixing — July's conclusion was just
   drawn during the hold window.
   Waiting for TikTok's "Content check lite" to clear before posting does NOT avoid the
   hold (the check ran 12 minutes without clearing, and the post was held anyway), so
   that wait is **off by default**. `TIKTOK_CONTENT_CHECK_WAIT_MS` re-enables it if
   TikTok's behaviour ever changes.
   **Don't re-diagnose this from a screenshot taken right after posting.** Use
   `node scripts/tiktok/tt-status.mjs` a few minutes later — it reads the content manager
   and exits 3 if anything is still private.
4. Every caption ends in hashtags, so TikTok's hashtag autocomplete is open right when we
   go to click Post. `tt-post.mjs` dismisses it (Escape + click a neutral heading) — don't
   remove that, the dropdown covers the settings and the Post button.
5. TikTok auto-suggests a **Location** chip (it showed "Lewisboro" — Jose's town). We never
   click it, so no location is attached. Don't add location handling.
6. TikTok doesn't return the post URL at upload time (the video is still processing), so
   `tiktok_queue.tiktok_url` stays null. The row records that the post was sent, not a
   link to it.

**Timing note:** a real post takes ~1 minute, plus the runner's 90s pause between posts.
Three queued posts is roughly 5 minutes. The scheduled task's 3-hour limit is slack, not
a constraint.

**Verified end to end 2026-08-05:** a real post (Demon Slayer Infinity Castle key visual)
went out through the queue → runner → TikTok and is live and public on @kumolabanime.

## Queue admin (SQL)
```sql
-- what's waiting
select slug, title, status, attempts, last_error from tiktok_queue order by created_at desc limit 20;
-- retry a failed job
update tiktok_queue set status='pending', attempts=0, last_error=null where id='…';
-- don't post this one
update tiktok_queue set status='skipped' where id='…';
```
