-- ============================================================================
-- NEW ARCHITECTURE: 3-Tier Intelligence System
-- Database Schema Migration
-- ============================================================================

-- ============================================================================
-- 1. DETECTION CANDIDATES TABLE
-- Stores raw detected content before processing
-- ============================================================================

CREATE TABLE IF NOT EXISTS detection_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source Information
    source_name TEXT NOT NULL,
    source_tier INTEGER NOT NULL CHECK (source_tier IN (1, 2, 3)),
    source_url TEXT NOT NULL,
    
    -- Content
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    raw_content TEXT,
    
    -- Timestamps
    detected_at TIMESTAMPTZ NOT NULL,
    original_timestamp TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Media
    media_urls TEXT[],
    
    -- Deduplication
    canonical_url TEXT,
    fingerprint TEXT,
    
    -- Extraction Method
    extraction_method TEXT NOT NULL CHECK (extraction_method IN ('RSS', 'YouTube', 'Nitter', 'HTML')),
    
    -- Processing Status
    status TEXT NOT NULL DEFAULT 'pending_processing' 
        CHECK (status IN ('pending_processing', 'processing', 'processed', 'discarded')),
    
    -- Scoring (populated after processing)
    score INTEGER,
    score_breakdown JSONB,
    action_taken TEXT CHECK (action_taken IN ('accept', 'reject', 'duplicate')),
    duplicate_of UUID REFERENCES detection_candidates(id),
    
    -- Metadata
    metadata JSONB,
    
    -- Index for performance
    CONSTRAINT valid_detection CHECK (char_length(title) > 0)
);

-- Indexes for detection_candidates
CREATE INDEX IF NOT EXISTS idx_candidates_status ON detection_candidates(status);
CREATE INDEX IF NOT EXISTS idx_candidates_detected_at ON detection_candidates(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_source ON detection_candidates(source_name);
CREATE INDEX IF NOT EXISTS idx_candidates_fingerprint ON detection_candidates(fingerprint);
CREATE INDEX IF NOT EXISTS idx_candidates_tier ON detection_candidates(source_tier);
CREATE INDEX IF NOT EXISTS idx_candidates_pending ON detection_candidates(status, detected_at) 
    WHERE status = 'pending_processing';

-- ============================================================================
-- 2. SOURCE HEALTH TRACKING TABLE
-- Monitors scraper source reliability
-- ============================================================================

CREATE TABLE IF NOT EXISTS source_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_name TEXT UNIQUE NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('RSS', 'YouTube', 'Nitter', 'HTML')),
    tier INTEGER NOT NULL CHECK (tier IN (1, 2, 3)),
    
    -- Health Metrics
    health_score INTEGER NOT NULL DEFAULT 100 CHECK (health_score >= 0 AND health_score <= 100),
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    total_requests INTEGER NOT NULL DEFAULT 0,
    successful_requests INTEGER NOT NULL DEFAULT 0,
    
    -- Timing
    last_check TIMESTAMPTZ,
    last_success TIMESTAMPTZ,
    skipped_until TIMESTAMPTZ,
    
    -- Status
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    
    -- Metadata
    check_interval_minutes INTEGER NOT NULL DEFAULT 10,
    weight INTEGER NOT NULL DEFAULT 5,
    
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for source_health
CREATE INDEX IF NOT EXISTS idx_source_health_enabled ON source_health(is_enabled);
CREATE INDEX IF NOT EXISTS idx_source_health_score ON source_health(health_score);
CREATE INDEX IF NOT EXISTS idx_source_health_tier ON source_health(tier);

-- ============================================================================
-- 3. PROCESSING METRICS TABLE
-- Tracks worker performance and statistics
-- ============================================================================

CREATE TABLE IF NOT EXISTS processing_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Run Information
    worker_type TEXT NOT NULL CHECK (worker_type IN ('detection', 'processing')),
    run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms INTEGER,
    
    -- Results
    candidates_detected INTEGER DEFAULT 0,
    candidates_processed INTEGER DEFAULT 0,
    new_candidates INTEGER DEFAULT 0,
    accepted_posts INTEGER DEFAULT 0,
    rejected_posts INTEGER DEFAULT 0,
    duplicates_found INTEGER DEFAULT 0,
    
    -- Source Breakdown
    sources_checked INTEGER DEFAULT 0,
    sources_succeeded INTEGER DEFAULT 0,
    sources_failed INTEGER DEFAULT 0,
    
    -- Status
    status TEXT NOT NULL CHECK (status IN ('success', 'error', 'partial')),
    error_message TEXT,
    
    -- Metadata
    details JSONB
);

-- Indexes for processing_metrics
CREATE INDEX IF NOT EXISTS idx_metrics_worker_type ON processing_metrics(worker_type);
CREATE INDEX IF NOT EXISTS idx_metrics_run_at ON processing_metrics(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_status ON processing_metrics(status);

-- ============================================================================
-- 4. UPDATE POSTS TABLE (add new columns for new architecture)
-- ============================================================================

-- Add scoring columns if not exists
ALTER TABLE posts ADD COLUMN IF NOT EXISTS score INTEGER;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS score_breakdown JSONB;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS detection_method TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS candidate_id UUID REFERENCES detection_candidates(id);

-- Add source tracking
ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_health_score INTEGER;

-- Add confidence level
ALTER TABLE posts ADD COLUMN IF NOT EXISTS confidence_level TEXT CHECK (confidence_level IN ('high', 'medium', 'low'));

-- Index for new columns
CREATE INDEX IF NOT EXISTS idx_posts_score ON posts(score);
CREATE INDEX IF NOT EXISTS idx_posts_confidence ON posts(confidence_level);
CREATE INDEX IF NOT EXISTS idx_posts_candidate ON posts(candidate_id);

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE detection_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE processing_metrics ENABLE ROW LEVEL SECURITY;

-- Policies for detection_candidates
CREATE POLICY "Allow all operations on detection_candidates" 
    ON detection_candidates FOR ALL 
    USING (true) WITH CHECK (true);

-- Policies for source_health
CREATE POLICY "Allow all operations on source_health" 
    ON source_health FOR ALL 
    USING (true) WITH CHECK (true);

-- Policies for processing_metrics
CREATE POLICY "Allow all operations on processing_metrics" 
    ON processing_metrics FOR ALL 
    USING (true) WITH CHECK (true);

-- ============================================================================
-- 6. INITIALIZE SOURCE HEALTH DATA
-- ============================================================================

INSERT INTO source_health (source_name, source_type, tier, weight, check_interval_minutes)
VALUES 
    ('AnimeNewsNetwork', 'RSS', 2, 8, 10),
    ('MyAnimeList', 'RSS', 2, 7, 10),
    ('Natalie.mu', 'RSS', 1, 9, 10),
    ('Oricon Anime', 'RSS', 1, 8, 10),
    ('Mantan Web', 'RSS', 2, 7, 15),
    ('AnimeUKNews', 'RSS', 2, 6, 15),
    ('Anime Herald', 'RSS', 2, 6, 15),
    ('YouTube_Tier1', 'YouTube', 1, 10, 10),
    ('Nitter', 'Nitter', 3, 2, 15)
ON CONFLICT (source_name) DO NOTHING;

-- ============================================================================
-- 7. FUNCTIONS FOR MAINTENANCE
-- ============================================================================

-- Function to clean up old processed candidates
CREATE OR REPLACE FUNCTION cleanup_old_candidates()
RETURNS void AS $$
BEGIN
    DELETE FROM detection_candidates
    WHERE status IN ('processed', 'discarded')
    AND detected_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Function to reset source health (for manual recovery)
CREATE OR REPLACE FUNCTION reset_source_health(source_name_param TEXT)
RETURNS void AS $$
BEGIN
    UPDATE source_health
    SET health_score = 100,
        consecutive_failures = 0,
        is_enabled = true,
        skipped_until = NULL,
        updated_at = NOW()
    WHERE source_name = source_name_param;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. VERIFICATION
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '3-Tier Intelligence System schema migration complete!';
    RAISE NOTICE 'New tables: detection_candidates, source_health, processing_metrics';
    RAISE NOTICE 'Updated table: posts (added scoring columns)';
END $$;
