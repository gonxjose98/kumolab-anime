-- Daily views per platform, the single source for the Analytics tab's
-- combined "total views" chart and per-platform tiles.
--
-- Meta only returns account insights in 30-day windows, so without storing
-- days ourselves the 60d/90d/all-time ranges can't show social views. One row
-- per (day, platform); collectors upsert, so re-running a day is safe.
--   website   = bot-filtered page_views
--   instagram = IG account `views` (total_value) for that UTC day
--   threads   = Threads account `views` daily series
--   x         = reserved for when the X API is connected
create table if not exists public.daily_views (
    day         date        not null,
    platform    text        not null,
    views       integer     not null default 0,
    updated_at  timestamptz not null default now(),
    primary key (day, platform)
);

-- Service-role only (admin dashboard reads through supabaseAdmin).
alter table public.daily_views enable row level security;
