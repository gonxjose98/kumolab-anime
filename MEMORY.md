# MEMORY.md — KumoLab Workspace

> Fast-start context for agents. Read `CLAUDE.md` (operating rules + secrets/runbooks)
> and `ROADMAP.md` (current phase + build history) before doing work. The company-wide
> steering docs live in `~/.claude/.claude/` — `APEX.md`, `GLOBAL-ROADMAP.md`, `SCOREBOARD.md`.

## What KumoLab is
An automated anime news + media brand (`kumolabanime.com`). It relays official, verified
anime news in a clean, premium format, and fans it out to social automatically. The content
pipeline is the asset; **the current job is to monetize it, not to keep polishing it.**

## Current phase — Monetize now (mirrors GLOBAL-ROADMAP Phase 1)
KumoLab is priority #1 for the $50k MRR goal. It is live and growing; the audience already
exists. Revenue is NOT gated behind a follower milestone. Three revenue lines to stand up:
1. **Display ads** — AdSense on the blog to start (Mediavine/Raptive need ~50k sessions/mo later).
2. **Sponsorships** — media kit + rate card from real analytics, outreach to anime/streaming/game brands.
3. **Merch** — Printful + Stripe are wired and the store is live; grow it with drops.

**Exit condition:** first repeatable revenue from at least one line (ads running, a sponsorship
closed, or merch selling). Growth work continues in the background but does not block monetization.

## Pipeline state (all LIVE, months stable)
- **Detection → Processing → Auto-approval → Scheduling → Publishing**, all via one entry point
  (`src/app/api/cron/route.ts`; Vercel cron in `vercel.json`). Detection every 30 min.
- **Auto-publish is live** to Website + Instagram + Facebook Page + Threads (direct Graph APIs).
  YouTube Shorts live for edited-only content. TikTok on hold (policy rejection; future Playwright path).
  X deferred.
- **Own email list** (`email_subscribers` + Resend), replaced ConvertKit. Studio video editor live.
- Hardening in place: per-post publish lock, circuit breaker, multi-layer dedup, AI provider chain,
  token auto-refresh, health monitor (now on cron).

## Role
Claude Code operates as **Co-CEO** (per APEX): decide and execute toward revenue, keep the
autonomous pipeline trustworthy, protect quality. Jose has final authority.

---

*Workspace active. Full repository access. Deploys: push `main` → Vercel auto-deploy.*
