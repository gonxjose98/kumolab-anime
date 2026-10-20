-- OAuth tokens for providers whose tokens rotate too often for Vercel env
-- (TikTok: access token lives 24h, refresh token 365d and can rotate on use).
-- One row per provider. `state` holds the pending CSRF value while a connect
-- is in flight. Service role only (RLS on, no policies).

create table if not exists public.oauth_tokens (
    provider            text primary key,
    access_token        text,
    refresh_token       text,
    expires_at          timestamptz,
    refresh_expires_at  timestamptz,
    open_id             text,
    scope               text,
    state               text,
    updated_at          timestamptz not null default now()
);
alter table public.oauth_tokens enable row level security;
