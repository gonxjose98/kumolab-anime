-- Complete Detection Worker Schema Fix
-- Run this to fix missing tables and columns

-- ============================================
-- 1. WORKER LOCKS (for preventing overlapping runs)
-- ============================================
DROP TABLE IF EXISTS worker_locks;

CREATE TABLE worker_locks (
  lock_id TEXT PRIMARY KEY,
  acquired_at TIMESTAMPTZ,
  process_id TEXT,
  hostname TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE worker_locks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON worker_locks;
CREATE POLICY "Allow all" ON worker_locks FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 2. DETECTION CANDIDATES (queue for detected content)
-- ============================================
DROP TABLE IF EXISTS detection_candidates;

CREATE TABLE detection_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name TEXT NOT NULL,
  source_tier INTEGER,
  source_url TEXT NOT NULL,
  title TEXT,
  content TEXT,
  raw_content TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  original_timestamp TIMESTAMPTZ,
  media_urls TEXT[] DEFAULT '{}',
  canonical_url TEXT,
  extraction_method TEXT,
  status TEXT DEFAULT 'pending_processing',
  fingerprint TEXT,
  metadata JSONB,
  processed_at TIMESTAMPTZ,
  processing_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_candidates_fingerprint ON detection_candidates(fingerprint);
CREATE INDEX IF NOT EXISTS idx_candidates_source_url ON detection_candidates(source_url);
CREATE INDEX IF NOT EXISTS idx_candidates_detected_at ON detection_candidates(detected_at);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON detection_candidates(status);

ALTER TABLE detection_candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON detection_candidates;
CREATE POLICY "Allow all" ON detection_candidates FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 3. PROCESSING METRICS (for tracking worker performance)
-- ============================================
DROP TABLE IF EXISTS processing_metrics;

CREATE TABLE processing_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_type TEXT,
  run_at TIMESTAMPTZ DEFAULT NOW(),
  duration_ms INTEGER,
  status TEXT,
  candidates_detected INTEGER DEFAULT 0,
  new_candidates INTEGER DEFAULT 0,
  sources_checked INTEGER DEFAULT 0,
  sources_failed INTEGER DEFAULT 0,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_worker_type ON processing_metrics(worker_type);
CREATE INDEX IF NOT EXISTS idx_metrics_run_at ON processing_metrics(run_at);

ALTER TABLE processing_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON processing_metrics;
CREATE POLICY "Allow all" ON processing_metrics FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 4. SCHEDULER LOGS (for general logging)
-- ============================================
DROP TABLE IF EXISTS scheduler_logs;

CREATE TABLE scheduler_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot TEXT,
  status TEXT,
  message TEXT,
  details TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduler_slot ON scheduler_logs(slot);
CREATE INDEX IF NOT EXISTS idx_scheduler_timestamp ON scheduler_logs(timestamp);

ALTER TABLE scheduler_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON scheduler_logs;
CREATE POLICY "Allow all" ON scheduler_logs FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 5. CONFIRMATION QUERY
-- ============================================
SELECT 'Tables created successfully' as status;
