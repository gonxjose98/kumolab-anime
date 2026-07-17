-- Compact history of mass emails actually sent (admin broadcasts + the weekly
-- Forecast). Written best-effort by sendBroadcast() in src/lib/email/send.ts;
-- surfaced as the "Sent history" dropdown on /admin/email. Distinct from
-- email_broadcasts (which stores full bodies + sending status): this is the
-- lightweight, append-only ledger the UI lists.
-- Same RLS posture as engine_config: RLS on + no policies = service-role only.

CREATE TABLE IF NOT EXISTS email_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('broadcast', 'forecast', 'system')),
  subject TEXT NOT NULL,
  recipient_count INT NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_sends_sent_at ON email_sends (sent_at DESC);

COMMENT ON TABLE email_sends IS
  'Ledger of mass emails sent (broadcast/forecast/system): subject, recipient count, when, by whom. RLS on + no policies = service-role only.';

ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
