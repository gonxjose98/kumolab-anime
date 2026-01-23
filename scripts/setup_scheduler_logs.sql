
-- Run this in the Supabase SQL Editor to enable Scheduler Logging

CREATE TABLE IF NOT EXISTS scheduler_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot TEXT NOT NULL,
    status TEXT NOT NULL, -- 'success', 'error', 'skipped', 'running'
    message TEXT,
    details JSONB,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    duration_ms INTEGER
);

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_scheduler_logs_timestamp ON scheduler_logs(timestamp DESC);

-- Optional: RLS policies (Open for now as it's admin only via service role)
ALTER TABLE scheduler_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users only" ON scheduler_logs
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Enable insert for service key only" ON scheduler_logs
    FOR INSERT
    TO service_role
    WITH CHECK (true);
