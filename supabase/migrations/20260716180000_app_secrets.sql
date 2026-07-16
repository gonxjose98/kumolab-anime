-- Server-only key/value secret store.
--
-- Some credentials can't live in Vercel env (e.g. we have no local Vercel token
-- to set them, or they're too large/awkward for env). This table holds them,
-- read exclusively by supabaseAdmin (service role) from server code. Same RLS
-- posture as every other private table: RLS on, NO policies, so anon/authed
-- clients are fully denied and only the service role can touch it.
--
-- value is TEXT (store JSON as a string; callers JSON.parse as needed).
-- First user: the GA4 Data API service-account key (key = 'ga4_service_account';
-- see src/lib/analytics/ga4.ts). The row itself is inserted out-of-band, not in
-- this migration, so the secret never lands in version control.

CREATE TABLE IF NOT EXISTS app_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_secrets IS
  'Server-only key/value secrets read by supabaseAdmin. RLS on + no policies = service-role only. Used for credentials that cannot be set as Vercel env vars.';

ALTER TABLE app_secrets ENABLE ROW LEVEL SECURITY;
