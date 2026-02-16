-- Migration to add event identity columns for deduplication
ALTER TABLE posts
ADD COLUMN IF NOT EXISTS event_fingerprint text,
ADD COLUMN IF NOT EXISTS truth_fingerprint text,
ADD COLUMN IF NOT EXISTS anime_id text,
ADD COLUMN IF NOT EXISTS season_label text;

-- Update ClaimType check constraint for new event types
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_claim_type_check;
ALTER TABLE posts ADD CONSTRAINT posts_claim_type_check CHECK (claim_type IN (
    'NEW_SEASON_CONFIRMED', 
    'DATE_ANNOUNCED', 
    'DELAY', 
    'NEW_KEY_VISUAL', 
    'TRAILER_DROP', 
    'CAST_ADDITION', 
    'STAFF_UPDATE',
    'STALE_CONFIRMATION_ABORT',
    'STALE_OR_DUPLICATE_FACT',
    'OTHER_ABORT',
    'confirmed',
    'premiered',
    'now_streaming',
    'delayed',
    'trailer',
    'finale_aired',
    'new_visual'
));

-- Add index for fast deduplication checks
CREATE INDEX idx_posts_fingerprint ON posts(event_fingerprint);

-- Comment on columns
COMMENT ON COLUMN posts.event_fingerprint IS 'Stable hash for deduplicating identical announcements across updates';
COMMENT ON COLUMN posts.anime_id IS 'Stable identifier for the anime series';
COMMENT ON COLUMN posts.season_label IS 'Display label for the specific season or arc';
