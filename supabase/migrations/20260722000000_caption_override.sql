-- Optional per-post social caption override. When set, the publisher uses this
-- text verbatim for IG/FB instead of the auto-generated hook + comment prompt
-- caption (buildSocialCaption). NULL/empty = auto-generate.
alter table public.posts add column if not exists caption_override text;
