-- Hand-entered platform totals for platforms we can't pull by API (TikTok).
-- Updated only when Jose asks; no cron. One row per platform.
-- Service role only (RLS on, no policies), same as anime_tiers.

create table if not exists public.manual_platform_stats (
    platform   text primary key,
    views      bigint,          -- all-time total views across posts
    followers  integer,
    likes      bigint,
    posts      integer,
    note       text,
    updated_at timestamptz not null default now()
);
alter table public.manual_platform_stats enable row level security;
