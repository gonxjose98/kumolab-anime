-- Editable copy for the automated ("system") emails: order confirmation,
-- cart recovery, The Forecast framing, and the signup welcome. One row per
-- email key; `fields` holds ONLY the overridden wording (subject, heading,
-- intro, ...). Hardcoded defaults live in src/lib/email/templates.ts and are
-- merged under these overrides at send time, so a missing row or field can
-- never break a send. Edited on /admin/email (owner only).
-- Same RLS posture as engine_config: RLS on + no policies = service-role only.

CREATE TABLE IF NOT EXISTS email_templates (
  key TEXT PRIMARY KEY,
  fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE email_templates IS
  'Overridden wording for system emails (order_confirmation, cart_recovery, forecast, welcome). Defaults live in code; these fields win when present. RLS on + no policies = service-role only.';

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
