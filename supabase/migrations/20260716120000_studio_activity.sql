-- studio_activity: per-user Studio production log (internal attribution).
--
-- One row per "produced" action so the team can see who edited what and
-- how much each member has shipped:
--   kind   ∈ 'video' | 'photo'
--   action ∈ 'finalize' (video export attach) | 'save' (photo Save persist)
--
-- Autosaves NEVER insert rows here (they only refresh the edited_by label
-- on the post), so counts reflect real exports/saves, not keystrokes.
--
-- Access is service-role only via /api/admin/studio/* (middleware
-- session-gates those routes + the 'studio' permission for sub-users):
-- RLS is enabled with NO policies, so the anon/authenticated keys cannot
-- touch the table directly. Same convention as studio_templates.

create table if not exists public.studio_activity (
    id uuid primary key default gen_random_uuid(),
    user_email text,
    user_name text,
    post_id uuid,
    kind text,
    action text,
    created_at timestamptz default now()
);

-- The aggregate readout groups by user/kind over time windows.
create index if not exists studio_activity_created_at_idx
    on public.studio_activity (created_at desc);

alter table public.studio_activity enable row level security;
-- No policies on purpose: service-role only.
