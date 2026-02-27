-- Add status column to posts table
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'published';

-- Update existing posts
UPDATE public.posts SET status = 'published' WHERE is_published = true;
UPDATE public.posts SET status = 'pending' WHERE is_published = false;

-- Create index
CREATE INDEX IF NOT EXISTS idx_posts_status ON public.posts(status);

-- Verify
SELECT 
  COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
  COUNT(*) FILTER (WHERE status = 'published') as published_count,
  COUNT(*) FILTER (WHERE status IS NULL) as null_count
FROM public.posts;
