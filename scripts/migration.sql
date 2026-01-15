-- Migration to add provenance columns to the posts table

ALTER TABLE posts
ADD COLUMN verification_tier text CHECK (verification_tier IN ('streamer', 'popularity', 'format_exception')),
ADD COLUMN verification_reason text,
ADD COLUMN verification_sources jsonb;

-- Comment on columns for clarity
COMMENT ON COLUMN posts.verification_tier IS 'Tier used to verify this post: streamer, popularity, or format_exception';
COMMENT ON COLUMN posts.verification_reason IS 'Human-readable string explaining why verification passed';
COMMENT ON COLUMN posts.verification_sources IS 'JSON object containing specific evidence (links, scores, statuses)';
