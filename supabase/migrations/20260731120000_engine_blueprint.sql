-- Engine Blueprint — backing tables and functions.
-- See docs/superpowers/specs/2026-07-31-engine-blueprint-design.md
--
-- Three things live here:
--   1. worker_runs    — per-cron-run telemetry. Drives every animation on the
--                       blueprint canvas. Nothing recorded run durations or
--                       result payloads before this; scheduler_logs covers only
--                       4 of the 15 workers and has neither.
--   2. agent_sessions — AI-agent presence heartbeats.
--   3. swap_post_slots — atomic slot swap. supabase-js has no client-side
--                       transactions, so a two-row swap MUST be a function or a
--                       partial write leaves two posts in one slot.

-- ── 1. worker_runs ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worker_runs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker      TEXT NOT NULL,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    ok          BOOLEAN,
    duration_ms INTEGER,
    -- The worker's own return payload, stored verbatim. That object already
    -- carries the interesting numbers (candidates, accepted, added, rotated),
    -- so the inspector shows real counts without modifying any worker.
    result      JSONB,
    error       TEXT
);

CREATE INDEX IF NOT EXISTS worker_runs_worker_time ON worker_runs (worker, started_at DESC);
CREATE INDEX IF NOT EXISTS worker_runs_time ON worker_runs (started_at DESC);

-- A row with finished_at IS NULL past its expected window is itself a
-- diagnosable state ("detection started 40 min ago and never returned"), which
-- is why the row is inserted BEFORE the worker runs rather than after.

ALTER TABLE worker_runs ENABLE ROW LEVEL SECURITY;
-- Service-role only. No anon/authenticated policy is defined on purpose: this
-- is operational telemetry, read exclusively through supabaseAdmin.

-- ── 2. agent_sessions ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_sessions (
    agent       TEXT PRIMARY KEY,
    activity    TEXT,
    node_id     TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS agent_sessions_expiry ON agent_sessions (expires_at);

ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;

-- Presence is SELF-REPORTED and advisory. It shows what an agent says it is
-- doing. It is never evidence that work occurred — worker_runs is that.

-- ── 3. swap_post_slots ──────────────────────────────────────────

/*
 * Atomically exchange the scheduled times of two posts.
 *
 * Compare-and-swap on both expected times, mirroring the CAS the automatic
 * scheduler already uses, so a swap racing runSlotSelection or a second admin
 * tab fails cleanly instead of corrupting the schedule.
 *
 * BOTH sides must already be scheduled. NULL scheduled_post_time is not an
 * empty value in this system — it is membership of the standby pool, and a post
 * put there is exposed to the pruner, which can demote it to 'pending'. No drag
 * may ever write NULL. Assigning a standby post is a different operation: a
 * single-row update gated on `scheduled_post_time IS NULL`, which needs no
 * transaction and does not belong here.
 *
 * Returns TRUE only if both rows were updated.
 */
CREATE OR REPLACE FUNCTION swap_post_slots(
    post_a     UUID,
    post_b     UUID,
    expected_a TIMESTAMPTZ,
    expected_b TIMESTAMPTZ
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    updated_a INT;
    updated_b INT;
BEGIN
    IF post_a = post_b THEN
        RAISE EXCEPTION 'swap_post_slots: cannot swap a post with itself';
    END IF;
    IF expected_a IS NULL OR expected_b IS NULL THEN
        RAISE EXCEPTION 'swap_post_slots: both posts must already be scheduled (NULL is standby-pool membership, not an empty slot)';
    END IF;

    -- Lock both rows in a deterministic order so two concurrent swaps sharing a
    -- post cannot deadlock.
    PERFORM 1 FROM posts WHERE id IN (post_a, post_b) ORDER BY id FOR UPDATE;

    UPDATE posts SET scheduled_post_time = expected_b
     WHERE id = post_a
       AND status = 'approved'
       AND scheduled_post_time = expected_a;
    GET DIAGNOSTICS updated_a = ROW_COUNT;

    UPDATE posts SET scheduled_post_time = expected_a
     WHERE id = post_b
       AND status = 'approved'
       AND scheduled_post_time = expected_b;
    GET DIAGNOSTICS updated_b = ROW_COUNT;

    IF updated_a <> 1 OR updated_b <> 1 THEN
        -- Someone moved one of them underneath us. Undo the whole thing.
        RAISE EXCEPTION 'swap_post_slots: stale state (a=% b=%), no change applied', updated_a, updated_b;
    END IF;

    RETURN TRUE;
END;
$$;

-- ── 4. Retention ────────────────────────────────────────────────
--
-- cleanup_old_logs is the single sweep the cleanup worker calls with one
-- retention value for all log tables. Extend it rather than adding a second
-- retention mechanism: ~170 worker runs a day means 30 days is ~5,000 rows.
--
-- Redefined in full because CREATE OR REPLACE cannot add a statement to an
-- existing body. The signature and RETURN TYPE are reproduced EXACTLY from
-- 20260420000002_functions_triggers_rls.sql:75 — CREATE OR REPLACE cannot alter
-- a return type, and cleanup-worker.ts:344 consumes the {table_name,
-- deleted_rows} row shape. All seven original deletes are preserved verbatim,
-- including scheduler_logs keying off `timestamp` (not `created_at`). Only the
-- two new tables are added.

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

  -- ── Added by the Engine Blueprint ──
  DELETE FROM worker_runs WHERE started_at < cutoff;
  GET DIAGNOSTICS d = ROW_COUNT;
  table_name := 'worker_runs'; deleted_rows := d; RETURN NEXT;

  -- Expired presence rows are worthless immediately, not after `retention_days`.
  DELETE FROM agent_sessions WHERE expires_at < NOW();
  GET DIAGNOSTICS d = ROW_COUNT;
  table_name := 'agent_sessions'; deleted_rows := d; RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
