-- Explore tab (admin): AI-written insight cards + per-run audit trail.
-- Service role only (RLS on, no policies), same as anime_tiers.

create table if not exists public.explore_runs (
    id              uuid primary key default gen_random_uuid(),
    trigger         text not null check (trigger in ('cron', 'manual')),
    started_at      timestamptz not null default now(),
    finished_at     timestamptz,
    status          text not null default 'running' check (status in ('running', 'ok', 'partial', 'skipped', 'error')),
    skip_reason     text,
    models          jsonb not null default '{}',   -- {ours:'claude-...', world:'claude-...', system:'claude-...'}
    input_tokens    integer not null default 0,
    output_tokens   integer not null default 0,
    cost_usd        numeric(10, 4) not null default 0,
    cards_kept      integer not null default 0,
    drops           jsonb not null default '[]',   -- validator rejections: [{section,title,reason}]
    digest_hash     text,
    digest_stats    jsonb,                         -- sizes / which inputs were missing
    system_snapshot jsonb,                         -- deterministic token + health facts at run time
    error           text
);
create index if not exists explore_runs_started_idx on public.explore_runs (started_at desc);
alter table public.explore_runs enable row level security;

create table if not exists public.explore_insights (
    id             uuid primary key default gen_random_uuid(),
    run_id         uuid not null references public.explore_runs(id) on delete cascade,
    section        text not null check (section in ('world', 'ours', 'system')),
    type           text not null,
    kind           text not null check (kind in ('fact', 'recommendation')),
    title          text not null,
    why            text not null,
    details        text,
    recommendation text,
    sources        jsonb not null default '[]',
    anime          text,
    confidence     text not null check (confidence in ('high', 'medium', 'low')),
    rank           integer not null,
    created_at     timestamptz not null default now(),
    expires_at     timestamptz not null,
    state          text not null default 'new' check (state in ('new', 'dismissed', 'acted')),
    state_by       text,
    state_at       timestamptz
);
create index if not exists explore_insights_live_idx on public.explore_insights (section, state, expires_at);
alter table public.explore_insights enable row level security;
