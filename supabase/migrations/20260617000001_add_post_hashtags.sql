-- Operator-curated social hashtags per post.
-- NULL  → auto-derive at publish time (defaultSocialHashtags in
--         src/lib/social/hashtags.ts) — preserves prior behavior for
--         auto-pipeline posts.
-- SET   → publish this exact list (sanitized, deduped, capped at 6 by
--         buildSocialHashtags). Edited via the admin editor's hashtag chip row.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS hashtags TEXT[];
