-- Migration to support live layered editing in the admin dashboard
-- This adds the "raw ingredients" needed to reconstruct the editor state.

ALTER TABLE posts
ADD COLUMN IF NOT EXISTS background_image text,
ADD COLUMN IF NOT EXISTS image_settings jsonb;

-- Comment on columns for clarity
COMMENT ON COLUMN posts.background_image IS 'The raw background image URL (no text, no branding)';
COMMENT ON COLUMN posts.image_settings IS 'JSON configuration for layered rendering (text scale, position, toggles, etc.)';
