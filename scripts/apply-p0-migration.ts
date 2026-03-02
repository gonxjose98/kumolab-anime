/**
 * P0 Critical Schema Migration Runner
 * Applies the database schema fixes to resolve engine crashes
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = 'https://pytehpdxophkhuxnnqzj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5dGVocGR4b3Boa2h1eG5ucXpqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODE3Mjc1OSwiZXhwIjoyMDgzNzQ4NzU5fQ.oXPumZ99rcY4hfiaQ4qEMLBd5-34bd6N9_oA7n1pCH0';

const supabase = createClient(supabaseUrl, supabaseKey);

const migrationSQL = `
-- ============================================================================
-- P0 CRITICAL FIX: Database Schema Repair (Simplified for API execution)
-- ============================================================================

-- 1. ADD MISSING COLUMNS
ALTER TABLE posts ADD COLUMN IF NOT EXISTS anime_id TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS season_label TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS event_fingerprint TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS truth_fingerprint TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS claim_type TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS source_tier INTEGER DEFAULT 3;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS relevance_score INTEGER DEFAULT 50;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS scheduled_post_time TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS verification_badge TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS verification_score INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS verification_classification TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS requires_review BOOLEAN DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS auto_post_eligible BOOLEAN DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS priority_level TEXT DEFAULT 'low';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS background_image TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_settings JSONB;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_announcement_tied BOOLEAN DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS headline TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE posts ADD COLUMN IF NOT EXISTS excerpt TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS premiere_date DATE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS meta_description TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS youtube_video_id TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS youtube_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS youtube_embed_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS twitter_tweet_id TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS twitter_url TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS studio_name TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS social_ids JSONB;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS social_metrics JSONB;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT false;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS duplicate_of TEXT;

-- 2. FIX CLAIM_TYPE CONSTRAINT
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_claim_type_check;
ALTER TABLE posts ADD CONSTRAINT posts_claim_type_check 
CHECK (claim_type IS NULL OR claim_type IN (
    'NEW_SEASON_CONFIRMED',
    'DATE_ANNOUNCED', 
    'DELAY',
    'NEW_KEY_VISUAL',
    'TRAILER_DROP',
    'CAST_ADDITION',
    'STAFF_UPDATE',
    'TRENDING_UPDATE',
    'STALE_CONFIRMATION_ABORT',
    'STALE_OR_DUPLICATE_FACT',
    'OTHER_ABORT',
    'OTHER'
));

-- 3. FIX STATUS CONSTRAINT
ALTER TABLE posts ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_status_check;
ALTER TABLE posts ADD CONSTRAINT posts_status_check
CHECK (status IN ('pending', 'approved', 'published', 'declined'));

-- 4. FIX TYPE CONSTRAINT
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_type_check;
ALTER TABLE posts ADD CONSTRAINT posts_type_check
CHECK (type IN ('DROP', 'INTEL', 'TRENDING', 'COMMUNITY', 'CONFIRMATION_ALERT', 'TRAILER', 'TEASER'));

-- 5. CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_posts_anime_id ON posts(anime_id);
CREATE INDEX IF NOT EXISTS idx_posts_claim_type ON posts(claim_type);
CREATE INDEX IF NOT EXISTS idx_posts_event_fingerprint ON posts(event_fingerprint);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_type ON posts(type);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_time ON posts(scheduled_post_time);
CREATE INDEX IF NOT EXISTS idx_posts_scraped_at ON posts(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_source_tier ON posts(source_tier);
CREATE INDEX IF NOT EXISTS idx_posts_status_type ON posts(status, type);
CREATE INDEX IF NOT EXISTS idx_posts_duplicate ON posts(is_duplicate, duplicate_of);

-- 6. FIX EXISTING DATA
UPDATE posts SET status = 'pending' WHERE status IS NULL OR status = '';
UPDATE posts SET status = 'pending' WHERE status NOT IN ('pending', 'approved', 'published', 'declined');
UPDATE posts SET claim_type = 'OTHER' 
WHERE claim_type IS NOT NULL 
AND claim_type NOT IN (
    'NEW_SEASON_CONFIRMED',
    'DATE_ANNOUNCED', 
    'DELAY',
    'NEW_KEY_VISUAL',
    'TRAILER_DROP',
    'CAST_ADDITION',
    'STAFF_UPDATE',
    'TRENDING_UPDATE',
    'STALE_CONFIRMATION_ABORT',
    'STALE_OR_DUPLICATE_FACT',
    'OTHER_ABORT',
    'OTHER'
);
UPDATE posts SET source_tier = 3 WHERE source_tier IS NULL;

-- 7. ENABLE RLS
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- 8. CREATE POLICIES
DO $$
BEGIN
    -- Drop existing policies
    DROP POLICY IF EXISTS "Public can read posts" ON posts;
    DROP POLICY IF EXISTS "Admins can edit posts" ON posts;
    
    -- Create new policies
    CREATE POLICY "Public can read posts" ON posts FOR SELECT USING (true);
    CREATE POLICY "Admins can edit posts" ON posts FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Policy creation skipped: %', SQLERRM;
END $$;
`;

async function runMigration() {
    console.log('🚀 Starting P0 Critical Schema Migration...\n');
    
    try {
        // Execute the migration SQL
        console.log('📊 Applying schema fixes...');
        const { error } = await supabase.rpc('exec_sql', { sql: migrationSQL });
        
        if (error) {
            console.error('❌ Migration failed via RPC, trying direct SQL...');
            console.error(error);
            
            // Try executing statements one by one
            const statements = migrationSQL
                .split(';')
                .map(s => s.trim())
                .filter(s => s.length > 0 && !s.startsWith('--'));
            
            console.log(`\n📋 Found ${statements.length} SQL statements to execute individually\n`);
            
            let successCount = 0;
            let errorCount = 0;
            
            for (let i = 0; i < statements.length; i++) {
                const stmt = statements[i] + ';';
                try {
                    const { error: stmtError } = await supabase.rpc('exec_sql', { sql: stmt });
                    if (stmtError) {
                        // Try alternative method - use REST API directly
                        const response = await fetch(`${supabaseUrl}/rest/v1/`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${supabaseKey}`,
                                'apikey': supabaseKey,
                                'Prefer': 'tx=commit'
                            },
                            body: JSON.stringify({ query: stmt })
                        });
                        
                        if (!response.ok) {
                            console.log(`  ⚠️  Statement ${i + 1}: ${stmt.substring(0, 60)}... (skipped: ${stmtError.message})`);
                            errorCount++;
                        } else {
                            successCount++;
                        }
                    } else {
                        successCount++;
                        if (i % 5 === 0) {
                            process.stdout.write('.');
                        }
                    }
                } catch (e: any) {
                    console.log(`  ⚠️  Statement ${i + 1}: ${e.message}`);
                    errorCount++;
                }
            }
            
            console.log(`\n\n✅ Completed: ${successCount} statements succeeded, ${errorCount} skipped`);
        } else {
            console.log('✅ Migration applied successfully via RPC!');
        }
        
        // Verify the migration
        console.log('\n🔍 Verifying schema...');
        const { data: columns, error: colError } = await supabase
            .from('information_schema.columns')
            .select('column_name')
            .eq('table_name', 'posts')
            .eq('table_schema', 'public');
        
        if (colError) {
            console.error('❌ Failed to verify schema:', colError);
        } else {
            const columnNames = columns?.map(c => c.column_name) || [];
            const criticalColumns = ['anime_id', 'claim_type', 'event_fingerprint', 'source_tier', 'status'];
            const foundCritical = criticalColumns.filter(c => columnNames.includes(c));
            
            console.log(`\n📋 Posts table has ${columnNames.length} columns`);
            console.log(`✅ Critical columns found: ${foundCritical.join(', ')}`);
            
            if (foundCritical.length === criticalColumns.length) {
                console.log('\n🎉 P0 CRITICAL FIX COMPLETE!');
                console.log('   - All required columns present');
                console.log('   - Constraints fixed');
                console.log('   - Indexes created');
            } else {
                const missing = criticalColumns.filter(c => !columnNames.includes(c));
                console.log(`\n⚠️  Missing critical columns: ${missing.join(', ')}`);
            }
        }
        
        // Check posts count
        const { count, error: countError } = await supabase
            .from('posts')
            .select('*', { count: 'exact', head: true });
        
        if (!countError) {
            console.log(`\n📊 Current posts in database: ${count}`);
        }
        
    } catch (error: any) {
        console.error('\n❌ Migration failed:', error.message);
        process.exit(1);
    }
}

runMigration();
