-- Release Radar + Anime Wire.
--
-- release_radar: one row per AniList show premiering or airing soon (next 60
--   days) plus the currently-airing top shows. Refreshed by the `radar` cron
--   worker. Every column is a fact from AniList; `chips` holds the computed
--   factual one-liners shown in the admin Radar view.
-- wire_items: every RSS / YouTube item the detection worker scans (before any
--   filtering), plus wire-only feeds and AniList trending. One row per
--   fingerprint; retained 60 days by the cleanup worker.
--
-- Both tables are service-role only (the admin reads through supabaseAdmin).

create table if not exists public.release_radar (
    anilist_id        integer primary key,
    title_english     text,
    title_romaji      text,
    season_label      text,
    format            text,
    episodes          integer,
    next_airing_at    timestamptz,
    next_episode      integer,
    start_date        date,
    status            text,
    popularity        integer,
    favourites        integer,
    trending          integer,
    average_score     integer,
    studios           text[]  not null default '{}',
    streaming         jsonb   not null default '[]'::jsonb,  -- [{name, url}]
    prequel_title     text,
    prequel_end_date  date,
    prequel_site_url  text,
    cover_image       text,
    banner_image      text,
    site_url          text,
    genres            text[]  not null default '{}',
    anticipation_rank integer,                               -- rank by popularity among upcoming shows
    chips             jsonb   not null default '[]'::jsonb,  -- ["premieres in 4 days", ...]
    updated_at        timestamptz not null default now()
);

create index if not exists release_radar_next_airing_idx on public.release_radar (next_airing_at);
create index if not exists release_radar_popularity_idx on public.release_radar (popularity desc);

alter table public.release_radar enable row level security;

create table if not exists public.wire_items (
    id            bigserial primary key,
    fingerprint   text not null unique,
    kind          text not null default 'news'
                  check (kind in ('news', 'streaming', 'release', 'youtube', 'trending')),
    title         text not null,
    url           text,
    source_name   text,
    published_at  timestamptz,
    detected_at   timestamptz not null default now(),
    anime_title   text,
    image         text,
    summary       text,
    decision      text
);

create index if not exists wire_items_published_idx on public.wire_items (published_at desc nulls last);
create index if not exists wire_items_kind_published_idx on public.wire_items (kind, published_at desc nulls last);
create index if not exists wire_items_detected_idx on public.wire_items (detected_at);

alter table public.wire_items enable row level security;
