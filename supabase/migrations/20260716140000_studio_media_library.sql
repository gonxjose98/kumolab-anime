-- Studio media library: folders of RAW images/videos (loose assets).
--
-- These are NOT posts and never enter the publish pipeline. Jose + team
-- create folders and upload raw pictures/videos into them; later flows
-- (e.g. carousel building) pull images out of a folder.
--
--   studio_folders — a named bucket of assets (created_by = Studio actor).
--   studio_media   — one row per uploaded asset; the file itself lives in
--                    Supabase Storage (blog-images / blog-videos via the
--                    /api/admin/upload-sign flow) and `url` is its public URL.
--
-- Deleting a folder cascades its studio_media rows; the storage objects are
-- intentionally left in place (cheap, and other rows/posts may reference the
-- same public URL).
--
-- Access is service-role only via /api/admin/studio/* (middleware gates those
-- routes by Supabase session + the 'studio' permission for sub-users):
-- RLS is enabled with NO policies, so the anon/authenticated keys cannot
-- touch these tables directly. Same convention as studio_templates and
-- studio_activity.

create table if not exists public.studio_folders (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_by text,
    created_by_email text,
    created_at timestamptz default now()
);

create table if not exists public.studio_media (
    id uuid primary key default gen_random_uuid(),
    folder_id uuid references public.studio_folders(id) on delete cascade,
    url text not null,
    kind text check (kind in ('image', 'video')),
    filename text,
    mime text,
    uploaded_by text,
    uploaded_by_email text,
    created_at timestamptz default now()
);

-- Folder views list newest-first.
create index if not exists studio_media_folder_created_idx
    on public.studio_media (folder_id, created_at desc);

alter table public.studio_folders enable row level security;
alter table public.studio_media enable row level security;
-- No policies on purpose: service-role only.
