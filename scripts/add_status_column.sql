-- Add status column to posts table for workflow management
-- This enables PENDING, APPROVED, DECLINED workflow

-- Add status column with default 'published' for existing posts
alter table public.posts add column if not exists status text default 'published';

-- Update existing posts to have appropriate status based on is_published
update public.posts set status = 'published' where is_published = true and (status is null or status = '');
update public.posts set status = 'pending' where is_published = false and (status is null or status = '');

-- Add index for performance
create index if not exists idx_posts_status on public.posts(status);

-- Add comment explaining the column
comment on column public.posts.status is 'Workflow status: pending, approved, published, declined';
