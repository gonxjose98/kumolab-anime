-- Anime Wire enrichment (dashboard redesign, 2026-10-09).
--
-- Filled by src/lib/discover/enrich.ts after the detection worker flushes the
-- wire. One Haiku call per ~20 rows writes a plain-English headline, an
-- is-this-anime flag, a normalized show name and a 1-5 importance score. The
-- same pass fetches og:image for rows the RSS gave no picture.
--
--   plain_title       short plain-English headline (falls back to title in UI)
--   is_anime          false = non-anime noise, hidden unless "All" is on
--   importance        1-5, from facts in the item only
--   radar_id          release_radar.anilist_id the item is about (soft link,
--                     radar rows come and go, so no FK)
--   enrich_attempts   model attempts, capped so a bad row never blocks the queue
--   image_checked_at  og:image lookup done (hit or miss), never refetched

alter table public.wire_items
    add column if not exists plain_title      text,
    add column if not exists is_anime         boolean,
    add column if not exists importance       smallint check (importance between 1 and 5),
    add column if not exists radar_id         integer,
    add column if not exists enrich_attempts  smallint not null default 0,
    add column if not exists enriched_at      timestamptz,
    add column if not exists image_checked_at timestamptz;

create index if not exists wire_items_enrich_queue_idx
    on public.wire_items (id desc) where plain_title is null;
