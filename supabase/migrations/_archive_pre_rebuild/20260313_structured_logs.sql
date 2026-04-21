-- ============================================================
-- Structured Logging System for KumoLab
-- 3 log types: action_logs, scraper_logs (already have agent_activity_log)
-- ============================================================

-- 1. Action Logs — all post lifecycle events
CREATE TABLE IF NOT EXISTS action_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL DEFAULT 'post',
    entity_id TEXT,
    entity_title TEXT,
    actor TEXT NOT NULL DEFAULT 'system',
    reason TEXT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_action_logs_created ON action_logs(created_at DESC);
CREATE INDEX idx_action_logs_action ON action_logs(action);
CREATE INDEX idx_action_logs_entity ON action_logs(entity_id);

-- 2. Scraper Logs — every candidate decision with reason
CREATE TABLE IF NOT EXISTS scraper_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    candidate_title TEXT NOT NULL,
    source_name TEXT,
    source_tier INTEGER,
    source_url TEXT,
    decision TEXT NOT NULL CHECK (decision IN ('accepted_pending', 'accepted_auto', 'rejected_duplicate', 'rejected_score', 'rejected_no_image', 'rejected_error', 'retry')),
    reason TEXT NOT NULL,
    score INTEGER,
    score_breakdown JSONB,
    duplicate_of TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scraper_logs_created ON scraper_logs(created_at DESC);
CREATE INDEX idx_scraper_logs_decision ON scraper_logs(decision);

-- 3. Error Logs — system errors for debugging
CREATE TABLE IF NOT EXISTS error_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    source TEXT NOT NULL,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    context JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_error_logs_created ON error_logs(created_at DESC);
CREATE INDEX idx_error_logs_source ON error_logs(source);

-- 4. Add source_url index on posts table (Fix #6)
CREATE INDEX IF NOT EXISTS idx_posts_source_url ON posts(source_url);

-- RLS
ALTER TABLE action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on action_logs" ON action_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on scraper_logs" ON scraper_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on error_logs" ON error_logs FOR ALL USING (true) WITH CHECK (true);
