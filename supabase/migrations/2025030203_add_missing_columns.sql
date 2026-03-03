-- Add missing columns to posts table for Processing Worker
-- Run this in Supabase SQL Editor

-- Add columns that don't exist
ALTER TABLE posts ADD COLUMN IF NOT EXISTS fingerprint TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS headline TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_tier INTEGER DEFAULT 3;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;

-- Add error_message column to detection_candidates for debugging
ALTER TABLE detection_candidates ADD COLUMN IF NOT EXISTS error_message TEXT;

SELECT 'Schema updated successfully' as status;
