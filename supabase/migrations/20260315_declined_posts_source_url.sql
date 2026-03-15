-- Add source_url column to declined_posts for URL-based dedup
ALTER TABLE declined_posts ADD COLUMN IF NOT EXISTS source_url text;

-- Index for fast URL lookups during detection dedup
CREATE INDEX IF NOT EXISTS idx_declined_posts_source_url ON declined_posts (source_url) WHERE source_url IS NOT NULL AND source_url != '';

-- Index for title similarity lookups (last 30 days)
CREATE INDEX IF NOT EXISTS idx_declined_posts_declined_at ON declined_posts (declined_at);
