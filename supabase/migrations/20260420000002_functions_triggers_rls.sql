-- KumoLab v1 functions, triggers, and RLS defaults

-- =========================================================================
-- UPDATED_AT TRIGGER
-- =========================================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_source_health_updated_at
  BEFORE UPDATE ON source_health
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =========================================================================
-- CLEANUP FUNCTIONS (called by daily cron worker)
-- =========================================================================

CREATE OR REPLACE FUNCTION cleanup_old_candidates()
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM detection_candidates
  WHERE detected_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Deletes expired Fork-2 posts. Writes redirect rows first so /blog/[slug]
-- can 301 to the social post (preserves link equity for indexed URLs).
-- Returns slug + image so the caller can delete bucket files.
CREATE OR REPLACE FUNCTION cleanup_expired_posts()
RETURNS TABLE(deleted_slug TEXT, deleted_image TEXT) AS $$
BEGIN
  INSERT INTO expired_redirects (slug, redirect_url, original_title)
  SELECT
    p.slug,
    COALESCE(
      p.social_ids->>'twitter_url',
      p.social_ids->>'instagram_url',
      p.social_ids->>'facebook_url',
      p.social_ids->>'threads_url',
      p.social_ids->>'tiktok_url',
      '/'
    ),
    p.title
  FROM posts p
  WHERE p.expires_at IS NOT NULL
    AND p.expires_at < NOW()
    AND p.social_ids != '{}'::jsonb
  ON CONFLICT (slug) DO NOTHING;

  RETURN QUERY
  DELETE FROM posts
  WHERE expires_at IS NOT NULL
    AND expires_at < NOW()
  RETURNING slug, image;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_old_logs(retention_days INT DEFAULT 30)
RETURNS TABLE(table_name TEXT, deleted_rows INT) AS $$
DECLARE
  d INT;
  cutoff TIMESTAMPTZ := NOW() - (retention_days || ' days')::INTERVAL;
BEGIN
  DELETE FROM scraper_logs WHERE created_at < cutoff;
  GET DIAGNOSTICS d = ROW_COUNT;
  table_name := 'scraper_logs'; deleted_rows := d; RETURN NEXT;

  DELETE FROM action_logs WHERE created_at < cutoff;
  GET DIAGNOSTICS d = ROW_COUNT;
  table_name := 'action_logs'; deleted_rows := d; RETURN NEXT;

  DELETE FROM scheduler_logs WHERE timestamp < cutoff;
  GET DIAGNOSTICS d = ROW_COUNT;
  table_name := 'scheduler_logs'; deleted_rows := d; RETURN NEXT;

  DELETE FROM error_logs WHERE created_at < cutoff;
  GET DIAGNOSTICS d = ROW_COUNT;
  table_name := 'error_logs'; deleted_rows := d; RETURN NEXT;

  DELETE FROM processing_metrics WHERE run_at < cutoff;
  GET DIAGNOSTICS d = ROW_COUNT;
  table_name := 'processing_metrics'; deleted_rows := d; RETURN NEXT;

  DELETE FROM agent_activity_log WHERE created_at < cutoff;
  GET DIAGNOSTICS d = ROW_COUNT;
  table_name := 'agent_activity_log'; deleted_rows := d; RETURN NEXT;

  DELETE FROM rejection_logs WHERE created_at < cutoff;
  GET DIAGNOSTICS d = ROW_COUNT;
  table_name := 'rejection_logs'; deleted_rows := d; RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_old_fingerprints(retention_days INT DEFAULT 90)
RETURNS INT AS $$
DECLARE deleted_count INT;
BEGIN
  DELETE FROM seen_fingerprints
  WHERE seen_at < NOW() - (retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_expired_redirects(retention_days INT DEFAULT 365)
RETURNS INT AS $$
DECLARE deleted_count INT;
BEGIN
  DELETE FROM expired_redirects
  WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_page_views(retention_days INT DEFAULT 90)
RETURNS INT AS $$
DECLARE deleted_count INT;
BEGIN
  DELETE FROM page_views
  WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_stale_locks()
RETURNS INT AS $$
DECLARE deleted_count INT;
BEGIN
  DELETE FROM worker_locks
  WHERE (expires_at IS NOT NULL AND expires_at < NOW())
     OR locked_at < NOW() - INTERVAL '10 minutes';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_old_tasks(retention_days INT DEFAULT 30)
RETURNS INT AS $$
DECLARE deleted_count INT;
BEGIN
  DELETE FROM tasks
  WHERE status = 'done'
    AND updated_at < NOW() - (retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cleanup_old_daily_reports(retention_days INT DEFAULT 180)
RETURNS INT AS $$
DECLARE deleted_count INT;
BEGIN
  DELETE FROM daily_reports
  WHERE report_date < CURRENT_DATE - retention_days;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION database_size_bytes()
RETURNS BIGINT AS $$
BEGIN
  RETURN pg_database_size(current_database());
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- RLS — enable on all tables, no policies.
-- Service role key bypasses RLS. Anon key has no access.
-- =========================================================================

ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE detection_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE seen_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE expired_redirects ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraper_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduler_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rejection_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_locks ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- STORAGE BUCKET
-- =========================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'blog-images',
  'blog-images',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read for blog-images" ON storage.objects;
CREATE POLICY "Public read for blog-images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'blog-images');
