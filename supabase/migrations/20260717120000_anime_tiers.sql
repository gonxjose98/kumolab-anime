-- Engine priority tiers: the canonical, human-editable list of which anime the
-- pipeline should prioritize. Source of truth the engine reads for posting
-- priority (Tier 1 = own it, Tier 2 = big-fanbase add, Tier 3 = opportunistic).
-- Seeded from IG-WATCHLIST.md out-of-band (the rows are mutable app data, edited
-- via /admin/engine, so they are not part of this schema migration).
--
-- Same RLS posture as every private table: RLS on, no policies = service-role
-- only (admin API reads/writes via supabaseAdmin).

CREATE TABLE IF NOT EXISTS anime_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anime TEXT NOT NULL,
  studio TEXT,
  tier INT NOT NULL CHECK (tier IN (1, 2, 3)),
  anilist_id INT,
  popularity INT,
  note TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per anime (case-insensitive), so re-tiering updates in place.
CREATE UNIQUE INDEX IF NOT EXISTS anime_tiers_anime_lower_idx ON anime_tiers (lower(anime));
CREATE INDEX IF NOT EXISTS anime_tiers_tier_idx ON anime_tiers (tier, sort_order);

COMMENT ON TABLE anime_tiers IS
  'Engine priority tiers per anime (1/2/3). Canonical source of truth the pipeline reads for posting priority; edited via /admin/engine. RLS on + no policies = service-role only.';

ALTER TABLE anime_tiers ENABLE ROW LEVEL SECURITY;
