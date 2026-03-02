-- Worker Locks Table for Mutex Protection
CREATE TABLE IF NOT EXISTS worker_locks (
    lock_id TEXT PRIMARY KEY,
    acquired_at TIMESTAMPTZ NOT NULL,
    process_id TEXT,
    hostname TEXT,
    metadata JSONB
);

-- Enable RLS
ALTER TABLE worker_locks ENABLE ROW LEVEL SECURITY;

-- Policy for all operations
CREATE POLICY "Allow all on worker_locks" 
    ON worker_locks FOR ALL 
    USING (true) WITH CHECK (true);

-- Index for fast lock lookup
CREATE INDEX IF NOT EXISTS idx_worker_locks_acquired 
    ON worker_locks(acquired_at);

COMMENT ON TABLE worker_locks IS 'Mutex locks for preventing overlapping worker executions';
