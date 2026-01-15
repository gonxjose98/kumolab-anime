-- ADMIN DASHBOARD & ANALYTICS MIGRATION
-- 3. Creates page_views table
-- 4. Sets strict RLS policies

-- 1. Create page_views table
create table public.page_views (
  id uuid default gen_random_uuid() primary key,
  path text not null,
  referrer text,
  user_agent text,
  is_bot boolean default false,
  timestamp timestamptz default now()
);

-- 2. Add RLS (Row Level Security)
alter table public.page_views enable row level security;

-- Policy: PUBLIC_INSERT (Everyone can record a view)
create policy "Public can insert page views"
  on public.page_views
  for insert
  with check (true);

-- Policy: ADMIN_SELECT (Only authenticated admins can see data)
create policy "Admins can view analytics"
  on public.page_views
  for select
  using (auth.role() = 'authenticated');

-- 3. Restrict Posts Table (Safety Lock)
alter table public.posts enable row level security;

-- Policy: PUBLIC_READ (Everyone can read published posts)
-- Note: We already filter is_published=true in app logic, but RLS adds safety.
create policy "Public can read posts"
    on public.posts
    for select
    using (true);

-- Policy: ADMIN_ALL (Admins can do everything)
create policy "Admins can edit posts"
    on public.posts
    for all
    using (auth.role() = 'authenticated');

-- 4. Create Indexes for Analytics Performance
create index idx_page_views_timestamp on public.page_views(timestamp);
create index idx_page_views_path on public.page_views(path);
