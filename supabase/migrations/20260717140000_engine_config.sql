-- Engine configuration: the human-editable operating rules the pipeline follows
-- and any AI agent can read + verify its work against. Key/value JSONB so new
-- config (formula, peak slots, future knobs) is additive. Rendered + edited on
-- /admin/engine. Rows (post_formula, peak_slots) are seeded out-of-band as
-- mutable app data. Same RLS posture: service-role only.

CREATE TABLE IF NOT EXISTS engine_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE engine_config IS
  'Human-editable engine operating rules (post formula, peak time slots, etc). Canonical source the pipeline + agents read. RLS on + no policies = service-role only.';

ALTER TABLE engine_config ENABLE ROW LEVEL SECURITY;
