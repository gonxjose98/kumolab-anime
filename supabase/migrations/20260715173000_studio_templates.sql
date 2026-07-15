-- studio_templates: named layout/style templates for the photo editor.
--
-- A template captures the LAYOUT subset of a slide's overlay settings
-- (placement, gradient, watermark, scales, image zoom/pan — see
-- LAYOUT_TEMPLATE_KEYS in src/lib/studio/slides.ts). It never stores the
-- slide's text content, source image, or purple word indices, so applying
-- a template to any other slide/picture copies the look, not the content.
--
-- Access is service-role only via /api/admin/studio/templates (middleware
-- session-gates /api/admin/*): RLS is enabled with NO policies, so the
-- anon/authenticated keys cannot touch the table directly.

create table if not exists public.studio_templates (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    kind text default 'photo',
    settings jsonb not null,
    created_by text,
    created_at timestamptz default now()
);

alter table public.studio_templates enable row level security;
-- No policies on purpose: service-role only.
