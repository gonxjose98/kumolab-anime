
-- Add social_metrics column to posts table if it doesn't exist
ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS social_metrics JSONB DEFAULT '{}'::jsonb;

-- Comment describing the structure (optional but helpful)
COMMENT ON COLUMN posts.social_metrics IS 'Stores aggregated social stats. Structure: { twitter: {views, likes, comments}, instagram: {...}, facebook: {...} }';
