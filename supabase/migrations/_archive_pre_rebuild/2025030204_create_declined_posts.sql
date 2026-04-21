-- Create declined_posts table to store rejected post titles for duplicate prevention
CREATE TABLE IF NOT EXISTS declined_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_post_id UUID,
  title TEXT NOT NULL,
  source TEXT,
  declined_at TIMESTAMPTZ DEFAULT NOW(),
  declined_by TEXT DEFAULT 'admin',
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick title lookups (duplicate prevention)
CREATE INDEX IF NOT EXISTS idx_declined_title ON declined_posts(title);

-- Enable RLS
ALTER TABLE declined_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON declined_posts FOR ALL USING (true) WITH CHECK (true);

SELECT 'declined_posts table created successfully' as status;
