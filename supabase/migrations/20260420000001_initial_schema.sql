-- KumoLab v1 initial schema — applied to Supabase project xzoqsldtcoeaegxcdsia on 2026-04-20
-- Fresh slate: storage-optimized, Fork 2 retention via expires_at
-- Every table is lean, unused-in-UI columns have been dropped from the old design

-- =========================================================================
-- CORE CONTENT TABLES
-- =========================================================================

CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  excerpt TEXT,
  image TEXT,
  type TEXT NOT NULL DEFAULT 'INTEL',
  claim_type TEXT,
  anime_id TEXT,
  source TEXT,
  source_url TEXT,
  source_tier INT,
  status TEXT NOT NULL DEFAULT 'pending',
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  scheduled_post_time TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  published_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  social_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  social_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_is_published ON posts(is_published) WHERE is_published = TRUE;
CREATE INDEX idx_posts_expires_at ON posts(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_posts_timestamp ON posts(timestamp DESC);
CREATE INDEX idx_posts_anime_claim ON posts(anime_id, claim_type) WHERE anime_id IS NOT NULL;
CREATE INDEX idx_posts_scheduled ON posts(scheduled_post_time) WHERE scheduled_post_time IS NOT NULL;

CREATE TABLE detection_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  source_url TEXT,
  canonical_url TEXT,
  source_name TEXT,
  source_tier INT,
  media_urls TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  extraction_method TEXT,
  claim_type TEXT,
  anime_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending_processing',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  original_timestamp TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX idx_dc_status ON detection_candidates(status);
CREATE INDEX idx_dc_fingerprint ON detection_candidates(fingerprint);
CREATE INDEX idx_dc_detected_at ON detection_candidates(detected_at);

CREATE TABLE seen_fingerprints (
  fingerprint TEXT PRIMARY KEY,
  anime_id TEXT,
  claim_type TEXT,
  origin TEXT NOT NULL,
  source_url TEXT,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sf_anime_claim ON seen_fingerprints(anime_id, claim_type) WHERE anime_id IS NOT NULL;
CREATE INDEX idx_sf_seen_at ON seen_fingerprints(seen_at);
CREATE INDEX idx_sf_source_url ON seen_fingerprints(source_url) WHERE source_url IS NOT NULL;

CREATE TABLE expired_redirects (
  slug TEXT PRIMARY KEY,
  redirect_url TEXT NOT NULL,
  original_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expired_redirects_created ON expired_redirects(created_at);

-- =========================================================================
-- SOURCE MANAGEMENT
-- =========================================================================

CREATE TABLE source_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name TEXT UNIQUE NOT NULL,
  source_type TEXT,
  tier INT,
  health_score INT NOT NULL DEFAULT 100,
  consecutive_failures INT NOT NULL DEFAULT 0,
  total_requests INT NOT NULL DEFAULT 0,
  successful_requests INT NOT NULL DEFAULT 0,
  last_check TIMESTAMPTZ,
  last_success TIMESTAMPTZ,
  skipped_until TIMESTAMPTZ,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  check_interval_minutes INT NOT NULL DEFAULT 30,
  weight INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sh_enabled ON source_health(is_enabled);

-- =========================================================================
-- LOGGING TABLES (all 30-day retention via cleanup cron)
-- =========================================================================

CREATE TABLE scraper_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_title TEXT,
  source_name TEXT,
  source_tier INT,
  source_url TEXT,
  decision TEXT,
  reason TEXT,
  score INT,
  score_breakdown JSONB,
  duplicate_of TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scraper_logs_created ON scraper_logs(created_at);

CREATE TABLE action_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT,
  entity_type TEXT,
  entity_id TEXT,
  entity_title TEXT,
  actor TEXT,
  reason TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_action_logs_created ON action_logs(created_at);

CREATE TABLE scheduler_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot TEXT,
  status TEXT,
  message TEXT,
  details JSONB,
  duration_ms INT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scheduler_logs_timestamp ON scheduler_logs(timestamp);

CREATE TABLE error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT,
  error_message TEXT,
  stack_trace TEXT,
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_error_logs_created ON error_logs(created_at);

CREATE TABLE processing_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_type TEXT,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INT,
  candidates_detected INT NOT NULL DEFAULT 0,
  candidates_processed INT NOT NULL DEFAULT 0,
  new_candidates INT NOT NULL DEFAULT 0,
  accepted_posts INT NOT NULL DEFAULT 0,
  rejected_posts INT NOT NULL DEFAULT 0,
  duplicates_found INT NOT NULL DEFAULT 0,
  sources_checked INT NOT NULL DEFAULT 0,
  sources_succeeded INT NOT NULL DEFAULT 0,
  sources_failed INT NOT NULL DEFAULT 0,
  status TEXT,
  error_message TEXT,
  details JSONB
);

CREATE INDEX idx_processing_metrics_run_at ON processing_metrics(run_at);

CREATE TABLE agent_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT,
  action TEXT,
  details TEXT,
  related_task_id UUID,
  related_post_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_activity_log_created ON agent_activity_log(created_at);

CREATE TABLE rejection_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_title TEXT,
  source_name TEXT,
  reason TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rejection_logs_created ON rejection_logs(created_at);

CREATE TABLE page_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path TEXT NOT NULL,
  referrer TEXT,
  user_agent TEXT,
  is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_page_views_path ON page_views(path);
CREATE INDEX idx_page_views_timestamp ON page_views(timestamp);

-- =========================================================================
-- ADMIN UI TABLES
-- =========================================================================

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  assigned_to TEXT,
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due ON tasks(due_date) WHERE due_date IS NOT NULL;

CREATE TABLE daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE UNIQUE NOT NULL,
  summary JSONB,
  metrics JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE worker_locks (
  lock_key TEXT PRIMARY KEY,
  locked_by TEXT,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- =========================================================================
-- SEED DATA
-- =========================================================================

INSERT INTO agents (name, role, status) VALUES
  ('Jarvis', 'Operations Coordinator', 'active'),
  ('Oracle', 'Decision + Scoring Engine', 'active'),
  ('Scraper', 'Detection + Ingestion', 'active'),
  ('Publisher', 'Multi-Platform Distribution', 'active')
ON CONFLICT (name) DO NOTHING;
