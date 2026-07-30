-- storage_bytes_by_bucket()
--
-- Object-storage usage per bucket, for the cleanup worker's size probe and the
-- admin health monitor.
--
-- WHY: the July 2026 outage that restricted the entire project API was the
-- blog-videos BUCKET filling the free-tier storage cap. The only size probe in
-- the codebase measured `database_size_bytes`, which never moves when object
-- storage fills, so the thing that actually took the site down was the one
-- thing nothing watched.
--
-- Reads storage.objects.metadata->>'size', the same field the Supabase
-- dashboard reports. Rows whose metadata is missing a size (uploads still in
-- flight) coalesce to 0 rather than dropping the bucket from the result.
--
-- SECURITY DEFINER because storage.objects is not readable by the anon/auth
-- roles; the function returns only aggregate byte counts, no object names or
-- paths. Execute is granted to service_role only, matching the rest of the
-- engine's RLS posture (service-role-only).

create or replace function public.storage_bytes_by_bucket()
returns table (bucket_id text, bytes bigint, objects bigint)
language sql
security definer
set search_path = public, storage
stable
as $$
    select
        o.bucket_id::text,
        coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint as bytes,
        count(*)::bigint as objects
    from storage.objects o
    group by o.bucket_id
$$;

revoke all on function public.storage_bytes_by_bucket() from public, anon, authenticated;
grant execute on function public.storage_bytes_by_bucket() to service_role;
