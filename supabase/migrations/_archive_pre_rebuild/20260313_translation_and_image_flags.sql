-- Add columns for translation tracking and image requirement flags
-- Posts table: track translated content and image status

ALTER TABLE posts ADD COLUMN IF NOT EXISTS needs_image boolean DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS original_title text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS original_content text;

-- Index for quickly finding posts that need images (pending review)
CREATE INDEX IF NOT EXISTS idx_posts_needs_image ON posts (needs_image) WHERE needs_image = true;
