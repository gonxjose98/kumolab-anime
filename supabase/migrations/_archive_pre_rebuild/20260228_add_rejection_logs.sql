-- Create rejection_logs table for scraper debugging
CREATE TABLE IF NOT EXISTS rejection_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    reason TEXT NOT NULL,
    article_url TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast querying
CREATE INDEX IF NOT EXISTS idx_rejection_logs_timestamp ON rejection_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_rejection_logs_source ON rejection_logs(source);

-- Enable RLS
ALTER TABLE rejection_logs ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users
CREATE POLICY "Allow all" ON rejection_logs FOR ALL USING (true) WITH CHECK (true);
