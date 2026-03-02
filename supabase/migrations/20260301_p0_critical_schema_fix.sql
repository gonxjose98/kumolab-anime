-- ============================================================================
-- P0 CRITICAL FIX: Database Schema Repair
-- Date: 2026-03-01
-- Purpose: Fix missing columns and constraint violations causing engine crashes
-- ============================================================================

-- ============================================================================
-- 1. FIX MISSING COLUMNS
-- ============================================================================

-- Add anime_id column (referenced in engine but missing from schema)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS anime_id TEXT;
COMMENT ON COLUMN posts.anime_id IS 'AniList anime ID for linking to series';

-- Add season_label column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS season_label TEXT;
COMMENT ON COLUMN posts.season_label IS 'Season label (e.g., Season 2, Part 1)';

-- Add event_fingerprint column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS event_fingerprint TEXT;
COMMENT ON COLUMN posts.event_fingerprint IS 'Hash for deduplication across sources';

-- Add truth_fingerprint column  
ALTER TABLE posts ADD COLUMN IF NOT EXISTS truth_fingerprint TEXT;
COMMENT ON COLUMN posts.truth_fingerprint IS 'Content hash for truth verification';

-- Add claim_type column if missing
ALTER TABLE posts ADD COLUMN IF NOT EXISTS claim_type TEXT;

-- Add source_tier column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_tier INTEGER DEFAULT 3;
COMMENT ON COLUMN posts.source_tier IS 'Source authority tier (1=studio, 2=publisher, etc)';

-- Add relevance_score column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS relevance_score INTEGER DEFAULT 50;
COMMENT ON COLUMN posts.relevance_score IS 'Calculated relevance for prioritization';

-- Add scraped_at column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMPTZ;
COMMENT ON COLUMN posts.scraped_at IS 'When content was originally scraped';

-- Add approved_at column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
COMMENT ON COLUMN posts.approved_at IS 'When post was approved';

-- Add approved_by column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS approved_by TEXT;
COMMENT ON COLUMN posts.approved_by IS 'User who approved the post';

-- Add scheduled_post_time column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS scheduled_post_time TIMESTAMPTZ;
COMMENT ON COLUMN posts.scheduled_post_time IS 'When post should be published';

-- Add verification columns
ALTER TABLE posts ADD COLUMN IF NOT EXISTS verification_badge TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS verification_score INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS verification_classification TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS requires_review BOOLEAN DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS auto_post_eligible BOOLEAN DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS priority_level TEXT DEFAULT 'low';

-- Add background_image column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS background_image TEXT;
COMMENT ON COLUMN posts.background_image IS 'Original background image URL';

-- Add image_settings column (JSONB for flexibility)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_settings JSONB;
COMMENT ON COLUMN posts.image_settings IS 'Image processing settings (text, gradient, etc)';

-- Add is_announcement_tied column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_announcement_tied BOOLEAN DEFAULT false;

-- Add headline column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS headline TEXT;
COMMENT ON COLUMN posts.headline IS 'Short headline for image overlay';

-- Add updated_at column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
COMMENT ON COLUMN posts.updated_at IS 'Last modification timestamp';

-- Add excerpt column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS excerpt TEXT;
COMMENT ON COLUMN posts.excerpt IS 'Brief excerpt for previews';

-- Add premiere_date column
ALTER TABLE posts ADD COLUMN IF NOT EXISTS premiere_date DATE;
COMMENT ON COLUMN posts.premiere_date IS 'Anime premiere date if applicable';

-- Add SEO columns
ALTER TABLE posts ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS meta_description TEXT;

-- Add social columns
ALTER TABLE posts ADD COLUMN IF NOT EXISTS youtube_video_id TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS youtube_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS youtube_embed_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS twitter_tweet_id TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS twitter_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS studio_name TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS social_ids JSONB;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS social_metrics JSONB;

-- Add duplicate detection columns
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS duplicate_of TEXT;

-- ============================================================================
-- 2. FIX CLAIM_TYPE CONSTRAINT
-- ============================================================================

-- Drop existing constraint if it exists
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_claim_type_check;

-- Add comprehensive constraint with ALL valid ClaimType values
ALTER TABLE posts ADD CONSTRAINT posts_claim_type_check 
CHECK (claim_type IS NULL OR claim_type IN (
    'NEW_SEASON_CONFIRMED',
    'DATE_ANNOUNCED', 
    'DELAY',
    'NEW_KEY_VISUAL',
    'TRAILER_DROP',
    'CAST_ADDITION',
    'STAFF_UPDATE',
    'TRENDING_UPDATE',
    'STALE_CONFIRMATION_ABORT',
    'STALE_OR_DUPLICATE_FACT',
    'OTHER_ABORT',
    'OTHER'
));

COMMENT ON COLUMN posts.claim_type IS 'Type of announcement/content claim';

-- ============================================================================
-- 3. FIX STATUS CONSTRAINT
-- ============================================================================

-- Ensure status column exists with proper default
ALTER TABLE posts ALTER COLUMN status SET DEFAULT 'pending';

-- Drop existing status constraint if any
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_status_check;

-- Add status constraint
ALTER TABLE posts ADD CONSTRAINT posts_status_check
CHECK (status IN ('pending', 'approved', 'published', 'declined'));

-- ============================================================================
-- 4. FIX TYPE CONSTRAINT
-- ============================================================================

-- Add type constraint for PostType
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_type_check;
ALTER TABLE posts ADD CONSTRAINT posts_type_check
CHECK (type IN ('DROP', 'INTEL', 'TRENDING', 'COMMUNITY', 'CONFIRMATION_ALERT', 'TRAILER', 'TEASER'));

-- ============================================================================
-- 5. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index for anime_id lookups
CREATE INDEX IF NOT EXISTS idx_posts_anime_id ON posts(anime_id);

-- Index for claim_type filtering
CREATE INDEX IF NOT EXISTS idx_posts_claim_type ON posts(claim_type);

-- Index for event fingerprint (deduplication)
CREATE INDEX IF NOT EXISTS idx_posts_event_fingerprint ON posts(event_fingerprint);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);

-- Index for type filtering
CREATE INDEX IF NOT EXISTS idx_posts_type ON posts(type);

-- Index for scheduled posts
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_time ON posts(scheduled_post_time);

-- Index for scraped_at (recent content)
CREATE INDEX IF NOT EXISTS idx_posts_scraped_at ON posts(scraped_at DESC);

-- Index for source_tier
CREATE INDEX IF NOT EXISTS idx_posts_source_tier ON posts(source_tier);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_posts_status_type ON posts(status, type);

-- Index for duplicate detection
CREATE INDEX IF NOT EXISTS idx_posts_duplicate ON posts(is_duplicate, duplicate_of);

-- ============================================================================
-- 6. VERIFY AND FIX EXISTING DATA
-- ============================================================================

-- Fix any null status values
UPDATE posts SET status = 'pending' WHERE status IS NULL OR status = '';

-- Fix invalid status values
UPDATE posts SET status = 'pending' WHERE status NOT IN ('pending', 'approved', 'published', 'declined');

-- Fix invalid claim_type values
UPDATE posts SET claim_type = 'OTHER' 
WHERE claim_type IS NOT NULL 
AND claim_type NOT IN (
    'NEW_SEASON_CONFIRMED',
    'DATE_ANNOUNCED', 
    'DELAY',
    'NEW_KEY_VISUAL',
    'TRAILER_DROP',
    'CAST_ADDITION',
    'STAFF_UPDATE',
    'TRENDING_UPDATE',
    'STALE_CONFIRMATION_ABORT',
    'STALE_OR_DUPLICATE_FACT',
    'OTHER_ABORT',
    'OTHER'
);

-- Set default source_tier for existing posts
UPDATE posts SET source_tier = 3 WHERE source_tier IS NULL;

-- ============================================================================
-- 7. ENABLE ROW LEVEL SECURITY (if not already enabled)
-- ============================================================================

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public can read posts" ON posts;
DROP POLICY IF EXISTS "Admins can edit posts" ON posts;

-- Create policies
CREATE POLICY "Public can read posts" ON posts FOR SELECT USING (true);
CREATE POLICY "Admins can edit posts" ON posts FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================================
-- 8. VERIFY TABLE STRUCTURE
-- ============================================================================

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'P0 Critical Schema Fix Applied Successfully';
    RAISE NOTICE 'Tables modified: posts';
    RAISE NOTICE 'Columns added: anime_id, season_label, event_fingerprint, truth_fingerprint, etc.';
    RAISE NOTICE 'Constraints fixed: claim_type, status, type';
    RAISE NOTICE 'Indexes created: 10 new indexes for performance';
END $$;
