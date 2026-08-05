-- TikTok publish queue.
--
-- TikTok rejected our developer app three times, so there is no API path for
-- posting to an owned account. Instead the publisher ENQUEUES a job here and a
-- local Playwright runner (scripts/tiktok/tt-runner.mjs, on Jose's PC via Task
-- Scheduler) drives the real TikTok Studio web upload and writes the result
-- back. Vercel never touches TikTok.
--
-- A job is only enqueued when the Instagram publish actually returned an id:
-- "whatever goes up on IG goes up on TikTok". That also means the queue
-- inherits IG's cadence (the 3/day peak slots) and needs no rate limit of its
-- own.

create table if not exists public.tiktok_queue (
    id            uuid primary key default gen_random_uuid(),
    post_id       uuid references public.posts(id) on delete cascade,
    slug          text,
    title         text,
    -- Public blog-videos bucket URL — the same watermarked MP4 that fed IG.
    video_url     text not null,
    caption       text not null default '',
    -- pending → posted | failed | skipped
    status        text not null default 'pending',
    attempts      int  not null default 0,
    last_error    text,
    tiktok_url    text,
    created_at    timestamptz not null default now(),
    posted_at     timestamptz
);

-- One job per post. A republish (operator retry, cron re-run) must not queue a
-- second TikTok post for the same content — the publisher upserts on this.
create unique index if not exists tiktok_queue_post_id_key
    on public.tiktok_queue (post_id)
    where post_id is not null;

-- The runner's only read: oldest pending first.
create index if not exists tiktok_queue_status_created_idx
    on public.tiktok_queue (status, created_at);

-- Service-role only. The runner authenticates with SUPABASE_SERVICE_ROLE_KEY;
-- no anon/authenticated client has any business reading a publish queue.
alter table public.tiktok_queue enable row level security;
