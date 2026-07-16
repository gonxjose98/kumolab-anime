-- Monthly analytics snapshots (Phase 1 of monthly reporting).
--
-- One row per reported month, captured shortly after the month ends by the
-- `monthly-snapshot` cron worker (or on demand via the admin "Snapshot now"
-- button, or historically via scripts/backfill-monthly-metrics.mjs).
--
-- Why snapshot at all: Meta only retains ~30 days of account-level insights
-- (reach, profile views, website clicks), so if we don't capture a month right
-- after it closes, those numbers are gone forever. Everything else (per-post
-- metrics, page_views, revenue) is re-derivable, but snapshotting it too gives
-- reports a single stable source.
--
-- Shape: one JSONB blob per platform. Every metric is NULLABLE — a metric we
-- could not measure is NULL, never 0. `meta` records per-metric provenance
-- (see src/lib/analytics/monthly-snapshot.ts):
--   'exact'                — measured for exactly this month
--   'trailing30_approx'    — trailing-30-day window standing in for the month
--   'backfilled_lifetime'  — lifetime per-post insights grouped by publish month
--   'pending_ga4'          — will be filled once the GA4 Data API pull lands
--   'unavailable:<reason>' — cannot be measured (e.g. no snapshot was taken)

CREATE TABLE monthly_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- First day of the REPORTED month (e.g. 2026-06-01 = June 2026's numbers).
  month DATE UNIQUE NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  website JSONB,
  instagram JSONB,
  facebook JSONB,
  threads JSONB,
  youtube JSONB,
  business JSONB,
  -- Per-metric provenance map, flat keys like "instagram.reach": "exact".
  meta JSONB,
  -- Deterministic template summary written at capture time; hand-editable later.
  analysis TEXT
);

COMMENT ON TABLE monthly_metrics IS
  'One analytics snapshot per reported month (month = first of that month). Written by the monthly-snapshot cron / admin Snapshot-now / backfill script. Metrics are NULL when unknown; meta maps each metric to its provenance.';

-- Service-role only (same posture as every other table): RLS on, no policies,
-- so anon/authed clients are denied and only supabaseAdmin can read/write.
ALTER TABLE monthly_metrics ENABLE ROW LEVEL SECURITY;
