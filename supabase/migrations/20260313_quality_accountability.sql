-- ============================================================
-- KumoLab Content Quality & Accountability System
-- ============================================================

-- 1. Daily Pipeline Reports
CREATE TABLE IF NOT EXISTS daily_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    report_date DATE NOT NULL UNIQUE,

    -- Pipeline metrics
    sources_checked INT NOT NULL DEFAULT 0,
    candidates_found INT NOT NULL DEFAULT 0,
    candidates_accepted INT NOT NULL DEFAULT 0,
    candidates_rejected INT NOT NULL DEFAULT 0,
    candidates_duplicate INT NOT NULL DEFAULT 0,
    posts_created INT NOT NULL DEFAULT 0,
    posts_published INT NOT NULL DEFAULT 0,
    posts_approved INT NOT NULL DEFAULT 0,
    posts_declined INT NOT NULL DEFAULT 0,
    errors_count INT NOT NULL DEFAULT 0,
    retries_count INT NOT NULL DEFAULT 0,

    -- Quality metrics
    avg_content_score NUMERIC(5,2) DEFAULT 0,
    avg_quality_grade TEXT DEFAULT 'N/A',
    grade_distribution JSONB DEFAULT '{}',

    -- Agent performance
    agent_scores JSONB DEFAULT '{}',

    -- Summary
    headline TEXT,
    issues TEXT[] DEFAULT '{}',
    highlights TEXT[] DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_daily_reports_date ON daily_reports(report_date DESC);

-- 2. Add quality_grade column to posts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'posts' AND column_name = 'quality_grade'
    ) THEN
        ALTER TABLE posts ADD COLUMN quality_grade TEXT DEFAULT NULL;
    END IF;
END $$;

-- 3. Agent performance snapshots (daily)
CREATE TABLE IF NOT EXISTS agent_performance (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_name TEXT NOT NULL,
    report_date DATE NOT NULL,

    -- Metrics
    tasks_completed INT DEFAULT 0,
    items_processed INT DEFAULT 0,
    errors INT DEFAULT 0,
    uptime_pct NUMERIC(5,2) DEFAULT 100.0,
    avg_response_time_ms INT DEFAULT 0,
    quality_score NUMERIC(5,2) DEFAULT 0,

    -- Details
    details JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(agent_name, report_date)
);

CREATE INDEX idx_agent_perf_date ON agent_performance(report_date DESC);
CREATE INDEX idx_agent_perf_name ON agent_performance(agent_name);

-- RLS
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on daily_reports" ON daily_reports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on agent_performance" ON agent_performance FOR ALL USING (true) WITH CHECK (true);
