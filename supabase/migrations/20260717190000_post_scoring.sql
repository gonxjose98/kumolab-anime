-- Post scoring (/100) + video-quality gate columns. See ENGINE-SCORING-MODEL.md.
--   post_score       — the /100 total at the last (re-)score. Standby candidates
--                      are re-scored as they age (recency decay), so this moves.
--   score_breakdown  — jsonb { total, verdict, components:[{label,earned,max,reason}],
--                      hard_gates:[{gate,passed}], meta:{detected_at,scored_at} }.
--                      The Engine tab's click-to-see popup reads this back verbatim.
--   video_height / video_bitrate / quality_tier — measured by ffprobe on the
--                      fetched MP4 at publish time (trailer-fetcher quality gate).
--                      quality_tier: FULL | OK | REJECT.
-- Apply BEFORE deploying the scoring wiring: the processing worker inserts
-- post_score/score_breakdown on every new post row.

ALTER TABLE posts ADD COLUMN IF NOT EXISTS post_score INT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS score_breakdown JSONB;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_height INT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS video_bitrate INT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS quality_tier TEXT;

COMMENT ON COLUMN posts.post_score IS '/100 content score (ENGINE-SCORING-MODEL.md); re-scored while pooled on standby';
COMMENT ON COLUMN posts.score_breakdown IS 'Full scoring breakdown: total, verdict, components[], hard_gates[], meta';
COMMENT ON COLUMN posts.video_height IS 'ffprobe-measured height (px) of the staged social MP4';
COMMENT ON COLUMN posts.video_bitrate IS 'ffprobe-measured overall bitrate (bits/sec) of the staged social MP4';
COMMENT ON COLUMN posts.quality_tier IS 'Video quality tier from the publish-time probe: FULL | OK | REJECT';
