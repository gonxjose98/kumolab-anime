# Full Codebase Audit: KumoLab Anime → Reusable AI Systems Mapping

## Context
Audit of `/home/user/kumolab-anime` — a production-grade automated anime news intelligence platform built with Next.js, Supabase, and multi-provider AI. The goal is to map every piece of code to the four engine categories and assess reusability for a freelance AI Systems Architect business.

---

## 1. CONTENT ENGINE — Scrapers, Content Filters, AI Generators, Auto-Posters, Schedulers

### Scrapers / Content Ingestion

| File | What It Does | Reusability | Changes Needed |
|------|-------------|-------------|----------------|
| `src/lib/engine/detection-worker.ts` | Master detection orchestrator — scans RSS, YouTube, X/Twitter, AniList every 10 min via GitHub Actions. Writes to `detection_candidates` table. Tracks source health. | **HIGH** — core scraper loop pattern is niche-agnostic | Replace source URLs and keyword filters in `sources-config.ts` and `intelligence-config.ts` |
| `src/lib/engine/expanded-rss.ts` | Custom RSS parser using native fetch + regex (no external library). Parses any RSS/Atom feed. | **HIGH** — zero dependencies, works with any RSS feed | Just swap feed URLs |
| `src/lib/engine/youtube-monitor.ts` | YouTube API v3 monitor — watches 30+ channels for new uploads, detects trailers/teasers/PVs | **HIGH** — channel list is configurable | Replace channel IDs, adjust keyword filters |
| `src/lib/engine/x-monitor.ts` | X/Twitter API v2 monitor with OAuth 1.0a — watches 10+ accounts | **HIGH** — account list is configurable | Replace monitored account handles |
| `src/lib/engine/twitter-monitor.ts` | Nitter RSS-based Twitter monitoring (no API key needed) | **HIGH** — free alternative to paid X API | Replace account handles |
| `src/lib/engine/fetchers.ts` | AniList GraphQL API — fetches airing episode schedules | **MEDIUM** — anime-specific but GraphQL pattern is reusable | Replace with target niche's data API |
| `src/lib/engine/sources-config.ts` | 4-tier source classification (auto-publish → manual only) with keyword filters (positive/negative) | **HIGH** — tier system is niche-agnostic | Replace source entities, keywords, and tier assignments |
| `src/lib/engine/intelligence-config.ts` | Scoring weights, reliability config, RSS feed URLs, YouTube channel IDs | **HIGH** — configuration-driven, easy to swap | Replace all source URLs and scoring weights |
| `src/lib/engine/dynamic-sources.ts` | Dynamic source management | **HIGH** — extensible pattern | Plug in new source types |

### Content Filtering & Scoring

| File | What It Does | Reusability | Changes Needed |
|------|-------------|-------------|----------------|
| `src/lib/engine/processing-worker.ts` | Hourly content processor — scores candidates, runs 4-layer dedup, accepts/rejects based on thresholds (accept >40, decline <20) | **HIGH** — scoring pipeline is generic | Adjust scoring weights and thresholds per niche |
| `src/lib/engine/content-grader.ts` | Quality scoring system for content | **HIGH** — generic grading pattern | Adjust grading criteria |
| `src/lib/engine/duplicate-prevention.ts` | 4-layer dedup: exact fingerprint, truth fingerprint, title similarity, image hash. 7-day lookback. | **HIGH** — works for any content type | Minimal — just adjust lookback window if needed |
| `src/lib/engine/verification.ts` | Source verification and trust scoring | **HIGH** — trust system applies to any domain | Adjust verification rules per niche |
| `src/lib/engine/utils.ts` | Fingerprint generation, shared utilities | **HIGH** — generic utility functions | None |

### AI Content Generation

| File | What It Does | Reusability | Changes Needed |
|------|-------------|-------------|----------------|
| `src/lib/engine/ai.ts` | `AntigravityAI` singleton — 3-tier provider fallback (Antigravity → Kimi/Moonshot → OpenAI). Native fetch, no SDK dependency. Methods: `processEditorialPrompt()`, `translateToEnglish()`, `formatKumoLabTitle()`, `generateFromIntel()` | **HIGH** — provider-agnostic AI wrapper | Replace system prompts and editorial guidelines |
| `src/lib/engine/prompts.ts` | AI prompt templates for content generation | **MEDIUM** — anime-specific prompts | Rewrite prompts for target niche |
| `src/lib/engine/generator.ts` | `generateDailyDropsPost()`, `generateIntelPost()` — creates structured posts from raw data | **MEDIUM** — post structure is anime-specific | Adapt post templates and field mappings |

### Image Processing

| File | What It Does | Reusability | Changes Needed |
|------|-------------|-------------|----------------|
| `src/lib/engine/image-processor.ts` | Sharp + @napi-rs/canvas — 4:5 portrait (1080x1350), branded overlays, text wrapping, gradient overlays, watermarks | **HIGH** — branded image generation is universal | Replace brand colors (#9D7BFF), logo, fonts |
| `src/lib/engine/image-selector.ts` | Smart image selection from available sources | **HIGH** — generic selection logic | Adjust selection criteria |

### Auto-Posting / Social Distribution

| File | What It Does | Reusability | Changes Needed |
|------|-------------|-------------|----------------|
| `src/lib/social/publisher.ts` | Publishes to Facebook (Graph API v18.0) + Instagram (container/publish flow). Controlled by `AUTO_PUBLISH_SOCIALS` flag. | **HIGH** — standard Meta API integration | Replace page IDs and access tokens |
| `src/app/api/admin/social/x/publish/route.ts` | Posts to X/Twitter via `twitter-api-v2` | **HIGH** — standard X API integration | Replace API credentials |
| `src/lib/social/analytics.ts` | Fetches engagement metrics from X, Instagram, Facebook | **HIGH** — standard social analytics | Replace credentials |
| `src/lib/social/signals.ts` | X/Twitter + Instagram signal checking (placeholder) | **LOW** — stub implementation | Needs to be built out |

### Schedulers / Cron Jobs

| File | What It Does | Reusability | Changes Needed |
|------|-------------|-------------|----------------|
| `src/app/api/cron/route.ts` | Unified cron dispatcher — routes to detection, processing, dailydrops, daily-report workers | **HIGH** — generic worker dispatcher pattern | Add/remove worker types |
| `src/app/api/cron/run-blog-engine/route.ts` | Vercel cron trigger with EST time-slot mapping and CRON_SECRET auth | **HIGH** — standard cron endpoint pattern | Adjust time slots |
| `scripts/run-engine.ts` | CLI entry point for manual engine execution | **HIGH** — standard script runner | None |
| `src/lib/logging/scheduler.ts` | Logs cron runs to `scheduler_runs` table | **HIGH** — generic scheduler logging | None |

---

## 2. LEAD ENGINE — Lead Capture, Databases, Email Follow-Up, Dashboards/Tracking

### Lead Capture

| File | What It Does | Reusability | Changes Needed |
|------|-------------|-------------|----------------|
| `src/app/api/subscribe/route.ts` | ConvertKit newsletter subscription — adds to form 8753533, tags with "KumoLab Subscribers" (tag 14489422) | **HIGH** — standard ConvertKit integration | Replace form ID, tag ID, API key |

### Database Layer

| File | What It Does | Reusability | Changes Needed |
|------|-------------|-------------|----------------|
| `src/lib/supabase/admin.ts` | Supabase admin client (service_role, bypasses RLS) | **HIGH** — standard Supabase setup | Replace project URL and keys |
| `src/lib/supabase/server.ts` | Server-side Supabase client | **HIGH** | Replace credentials |
| `src/lib/supabase/client.ts` | Browser-side Supabase client | **HIGH** | Replace credentials |
| `supabase/migrations/` (12+ files) | Full schema: posts, detection_candidates, source_health, processing_metrics, scheduler_runs, scraper_logs, error_logs, action_logs, agent_activity_log | **MEDIUM** — schema is anime-specific but patterns are reusable | Rename tables/columns for target domain |

### Email Follow-Up

| File | What It Does | Reusability | Changes Needed |
|------|-------------|-------------|----------------|
| `src/lib/email.ts` | Resend integration for shipping emails — branded HTML template with carrier tracking (USPS, UPS, FedEx, DHL) | **MEDIUM** — currently shipping-only, email sending is commented out | Uncomment Resend API call, add `RESEND_API_KEY`, expand to marketing/drip sequences |

### Tracking / Analytics Dashboards

| File | What It Does | Reusability | Changes Needed |
|------|-------------|-------------|----------------|
| `src/components/admin/AnalyticsDashboard.tsx` | 30-day views chart, social metrics breakdown | **MEDIUM** — anime metrics baked in | Generalize metric labels |
| `src/components/admin/PostAnalytics.tsx` | Per-post engagement analytics | **HIGH** — works for any content type | Minimal |
| `src/app/admin/dashboard/page.tsx` | Admin dashboard page with analytics | **HIGH** — standard dashboard layout | Replace branding |

---

## 3. AUTOMATION ENGINE — API Connectors, Workflow Automation, Business Logic Triggers

### API Connectors

| File | What It Does | Reusability | Changes Needed |
|------|-------------|-------------|----------------|
| `src/lib/stripe.ts` | Stripe client init (API v2025-02-24) | **HIGH** — standard Stripe setup | Replace secret key |
| `src/app/api/checkout/route.ts` | Stripe checkout session creation | **HIGH** — standard checkout flow | Replace product/price config |
| `src/app/api/webhooks/stripe/route.ts` | Handles `checkout.session.completed` | **HIGH** — standard webhook handler | Adjust fulfillment logic |
| `src/lib/printful.ts` | Printful order creation API | **HIGH** — standard POD integration | Replace access token |
| `src/app/api/webhooks/printful/route.ts` | Handles `package_shipped` → triggers shipping email | **HIGH** — standard webhook handler | Adjust notification logic |
| `src/lib/engine/ai.ts` | Multi-provider AI connector (Antigravity/Kimi/OpenAI) | **HIGH** — provider-agnostic pattern | Replace API keys and endpoints |

### Workflow Automation (The Core Pipeline)

| File | What It Does | Reusability | Changes Needed |
|------|-------------|-------------|----------------|
| `src/lib/engine/engine.ts` | Master orchestrator — Daily Drops (6AM), scheduled post publishing, slot-based execution | **HIGH** — slot-based engine pattern is universal | Replace slot logic and post types |
| `src/lib/engine/detection-worker.ts` | Detection → Candidate pipeline (every 10 min) | **HIGH** — generic detect-and-queue pattern | Replace sources |
| `src/lib/engine/processing-worker.ts` | Candidate → Post pipeline (hourly) | **HIGH** — generic score-and-publish pattern | Replace scoring criteria |

### Business Logic Triggers

| File | What It Does | Reusability | Changes Needed |
|------|-------------|-------------|----------------|
| `src/lib/engine/duplicate-prevention.ts` | Blocks duplicate content before publishing | **HIGH** | None |
| `src/lib/engine/verification.ts` | Trust-based auto-publish vs human review routing | **HIGH** | Adjust trust rules |
| 49 API routes in `src/app/api/admin/` | CRUD operations: approve, decline, schedule, bulk-delete, cleanup-duplicates, generate, render images, manage sources | **MEDIUM-HIGH** — admin API patterns are generic | Rename endpoints, adjust data models |

---

## 4. MISSION CONTROL — Calendars, Logs, Status Dashboards, Scheduling Interfaces

### Admin Dashboard (Full Management UI)

| File | What It Does | Reusability | Changes Needed |
|------|-------------|-------------|----------------|
| `src/components/admin/AdminTabs.tsx` | Tab navigation for admin sections | **HIGH** — generic UI pattern | Rename tabs |
| `src/components/admin/AdminSubLayout.tsx` | Admin layout wrapper | **HIGH** | Replace branding |
| `src/components/admin/PostManager.tsx` | Main post editor — image preview, toggles, status controls | **MEDIUM** — anime field names baked in | Rename fields for target domain |
| `src/components/admin/ApprovalsPage.tsx` | Approval workflow UI | **HIGH** — generic approval pattern | Minimal |
| `src/components/admin/ScraperPanel.tsx` | Scraper status monitoring | **HIGH** — shows any scraper's health | Minimal |
| `src/components/admin/ConnectionsPanel.tsx` | Integration connection status | **HIGH** — shows API health | Minimal |
| `src/components/admin/AgentsPage.tsx` | Agent management UI | **HIGH** | Minimal |
| `src/components/admin/TasksPage.tsx` | Task queue management | **HIGH** | Minimal |
| `src/components/admin/HamburgerMenu.tsx` | Mobile admin navigation | **HIGH** | Minimal |

### Calendar & Scheduling

| File | What It Does | Reusability | Changes Needed |
|------|-------------|-------------|----------------|
| `src/components/admin/CalendarPage.tsx` | Publishing calendar view | **HIGH** — generic calendar UI | Minimal |
| `src/app/api/admin/calendar-events/route.ts` | Calendar event API | **HIGH** | Minimal |
| `src/app/api/admin/schedule/route.ts` | Post scheduling API | **HIGH** | Minimal |

### Logs & Monitoring

| File | What It Does | Reusability | Changes Needed |
|------|-------------|-------------|----------------|
| `src/components/admin/LogsPage.tsx` | System logs viewer | **HIGH** — generic log viewer | Minimal |
| `src/lib/logging/structured-logger.ts` | 4-table logging: action_logs, scraper_logs, error_logs, agent_activity_log | **HIGH** — universal logging system | None |
| `src/lib/logging/scheduler.ts` | Cron execution logging | **HIGH** | None |
| `src/lib/engine/daily-report.ts` | Daily pipeline analytics report | **HIGH** — generic pipeline reporting | Adjust metrics |
| `src/app/api/admin/logs/route.ts` | Logs API endpoint | **HIGH** | None |
| `src/app/api/admin/activity/route.ts` | Activity feed API | **HIGH** | None |
| `src/app/api/admin/connections/status/route.ts` | Connection health API | **HIGH** | None |
| `src/app/api/admin/source-stats/route.ts` | Source statistics API | **HIGH** | None |
| `src/app/api/admin/reports/route.ts` | Report generation API | **HIGH** | None |

### Daily Briefing

| File | What It Does | Reusability | Changes Needed |
|------|-------------|-------------|----------------|
| `src/components/admin/DailyBriefing.tsx` | Daily summary for operators | **HIGH** — any business can use a daily briefing | Replace metric names |

---

## 5. ADDITIONAL SYSTEMS (Outside the 4 Engines)

### E-Commerce / Merch Store

| File | What It Does | Reusability |
|------|-------------|-------------|
| `src/app/merch/page.tsx` | Product listing page | **HIGH** |
| `src/app/merch/[id]/page.tsx` | Product detail page | **HIGH** |
| `src/app/merch/cart/page.tsx` | Shopping cart | **HIGH** |
| `src/app/merch/success/page.tsx` | Purchase confirmation | **HIGH** |
| `src/components/merch/ProductClient.tsx` | Product display component | **HIGH** |
| `src/store/useCartStore.ts` | Zustand cart state management | **HIGH** |
| `src/data/products.json` | Product catalog | Replace products |
| `src/lib/merch.ts` | Merch utilities | **HIGH** |

### Public Frontend

| File | What It Does | Reusability |
|------|-------------|-------------|
| `src/components/home/Hero.tsx` | Hero section | **MEDIUM** — anime-branded |
| `src/components/home/StatsBar.tsx` | Stats display | **HIGH** |
| `src/components/home/MostRecentFeed.tsx` | Content feed | **HIGH** |
| `src/components/home/TrendingCarousel.tsx` | Trending posts | **HIGH** |
| `src/components/home/LatestUpdates.tsx` | Latest news | **HIGH** |
| `src/components/blog/BlogCard.tsx` | Post card component | **HIGH** |
| `src/components/blog/BlogList.tsx` | Post list component | **HIGH** |
| `src/components/blog/ShareButtons.tsx` | Social share buttons | **HIGH** |
| `src/app/blog/[slug]/page.tsx` | Blog post page | **HIGH** |
| `src/components/seo/JsonLd.tsx` | JSON-LD structured data | **HIGH** |
| `src/components/analytics/AnalyticsTracker.tsx` | Analytics tracking | **HIGH** |

### Auth

| File | What It Does | Reusability |
|------|-------------|-------------|
| `src/app/api/auth/route.ts` | Authentication endpoint | **HIGH** — Supabase auth |
| `src/app/admin/login/page.tsx` | Admin login page | **HIGH** |
| `src/components/admin/LogoutButton.tsx` | Logout button | **HIGH** |

---

## FINAL ASSESSMENT

### READY TO REUSE — Built, clean, deployable as-is with config changes only

1. **Content Detection Pipeline** (`detection-worker.ts`, `expanded-rss.ts`, `youtube-monitor.ts`, `x-monitor.ts`, `twitter-monitor.ts`) — Swap source URLs/channels/accounts and deploy. The 4-tier source classification in `sources-config.ts` works for any industry.

2. **Content Scoring & Dedup System** (`processing-worker.ts`, `duplicate-prevention.ts`, `content-grader.ts`) — 4-layer dedup and weighted scoring. Adjust weights in `intelligence-config.ts` and it works for any content type.

3. **Multi-Provider AI Wrapper** (`ai.ts`) — 3-tier fallback (Antigravity → Kimi → OpenAI) with zero SDK dependencies. Drop in any AI-powered project.

4. **Social Media Publisher** (`publisher.ts`, `x/publish/route.ts`) — Facebook, Instagram, X auto-posting. Just swap credentials.

5. **Social Media Analytics** (`analytics.ts`) — Cross-platform engagement tracking. Credential swap only.

6. **Cron/Scheduler System** (`cron/route.ts`, `run-blog-engine/route.ts`, `scheduler.ts`) — Generic worker dispatcher with logging. Works for any scheduled automation.

7. **Structured Logging** (`structured-logger.ts`, `scheduler.ts`) — 4-table logging system (actions, scraper decisions, errors, agent activity). Universal.

8. **Branded Image Generator** (`image-processor.ts`) — 1080x1350 portrait with overlays, watermarks, text wrapping. Replace brand colors/logo.

9. **Stripe + Printful E-Commerce** (`stripe.ts`, `printful.ts`, webhooks, cart, checkout) — Full POD merch store. Swap products and credentials.

10. **ConvertKit Lead Capture** (`subscribe/route.ts`) — Newsletter signup with tagging. Swap form/tag IDs.

11. **Supabase Database Layer** (`admin.ts`, `server.ts`, `client.ts`) — Standard setup, works anywhere.

12. **Admin Mission Control UI** — Approvals, calendar, logs, scraper panel, connections panel, tasks, agents, daily briefing. All generic patterns with anime labels that can be renamed.

13. **Blog/Content Frontend** — BlogCard, BlogList, ShareButtons, SEO JsonLd, AnalyticsTracker. Generic content display.

### NEEDS FINISHING — Partially built, requires work before selling

1. **Email Automation** (`src/lib/email.ts`) — Resend integration exists but is commented out. Only handles shipping emails. **Missing**: drip sequences, welcome emails, re-engagement campaigns, newsletter broadcasts. Needs 2-3 days of work to become a full email engine.

2. **Social Signals Monitoring** (`src/lib/social/signals.ts`) — Placeholder/stub implementation for X and Instagram signal detection. **Missing**: actual signal processing logic, trend detection, alert triggers. Needs 1-2 days.

3. **Daily Report** (`src/lib/engine/daily-report.ts`) — Exists but needs verification that it produces actionable output for non-anime contexts. May need generalization.

4. **Admin Analytics Dashboard** (`AnalyticsDashboard.tsx`, `PostAnalytics.tsx`) — Functional but has anime-specific metric labels and chart configurations hardcoded. Needs 1 day to abstract into a configurable dashboard.

5. **87+ Debug/Utility Scripts** (`scripts/`) — Huge collection of one-off scripts. Many contain useful patterns (data fixes, migrations, bulk operations) but are anime-specific and would need cleanup/generalization to be reusable tooling.

6. **Database Migrations** (`supabase/migrations/`) — 12+ migration files with anime-specific column names. Need to be consolidated into a single clean migration for a fresh project template.

### MISSING ENTIRELY — Gaps to build before having a complete sellable system

1. **CRM / Lead Database** — No lead scoring, no pipeline stages, no deal tracking. ConvertKit captures emails but there's no internal CRM. Need: lead table, scoring rules, pipeline stages, conversion tracking.

2. **Email Drip Sequences** — No automated follow-up sequences. Need: sequence builder, trigger rules, template system, A/B testing, unsubscribe handling.

3. **Client Onboarding Flow** — No self-service setup. Need: multi-tenant config, onboarding wizard, source configuration UI, brand customization interface.

4. **Multi-Tenant Architecture** — Everything is single-tenant (one anime site). Need: tenant isolation, per-client config, shared infrastructure with client-specific data.

5. **Reporting / ROI Dashboard** — No client-facing reports. Need: engagement summaries, growth metrics, content performance, exportable reports (PDF/CSV).

6. **Slack/Discord Notifications** — No real-time alerts to operators. Need: webhook integrations for content published, errors, daily summaries.

7. **White-Label Theming** — Frontend is anime-branded. Need: theme configuration system, logo/color/font customization per client.

8. **Documentation / Playbooks** — MEMORY.md and DEPLOYMENT.md exist but there's no client-facing documentation or setup guide for non-technical users.

9. **Testing Suite** — No automated tests found. Need: unit tests for scoring/dedup logic, integration tests for pipeline, E2E tests for admin flows.

10. **Rate Limiting / Usage Metering** — No tracking of API usage per client. Need: rate limits, usage dashboards, billing integration if offering as SaaS.

---

## Implementation Plan

This audit will be committed as a markdown document to the repository on branch `claude/audit-codebase-mapping-P52dF`. No code changes — documentation only.

### Verification
- Review the committed audit file for accuracy against the actual codebase
- Cross-reference file paths mentioned in the audit with actual files using `ls` and `cat`
