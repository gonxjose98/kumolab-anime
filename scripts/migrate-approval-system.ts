
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
    console.log('Starting migration...');

    // 1. Update posts table
    const { error: error1 } = await supabase.rpc('run_sql', {
        sql: `
            -- Add columns to posts table if they don't exist
            DO $$ 
            BEGIN 
                -- status
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='status') THEN
                    ALTER TABLE posts ADD COLUMN status TEXT DEFAULT 'pending';
                END IF;

                -- source_tier
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='source_tier') THEN
                    ALTER TABLE posts ADD COLUMN source_tier INTEGER DEFAULT 3;
                END IF;

                -- relevance_score
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='relevance_score') THEN
                    ALTER TABLE posts ADD COLUMN relevance_score INTEGER DEFAULT 0;
                END IF;

                -- is_duplicate
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='is_duplicate') THEN
                    ALTER TABLE posts ADD COLUMN is_duplicate BOOLEAN DEFAULT FALSE;
                END IF;

                -- duplicate_of
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='duplicate_of') THEN
                    ALTER TABLE posts ADD COLUMN duplicate_of INTEGER;
                END IF;

                -- scraped_at
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='scraped_at') THEN
                    ALTER TABLE posts ADD COLUMN scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
                END IF;

                -- approved_at
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='approved_at') THEN
                    ALTER TABLE posts ADD COLUMN approved_at TIMESTAMP WITH TIME ZONE;
                END IF;

                -- approved_by
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='approved_by') THEN
                    ALTER TABLE posts ADD COLUMN approved_by TEXT;
                END IF;

                -- scheduled_post_time
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='scheduled_post_time') THEN
                    ALTER TABLE posts ADD COLUMN scheduled_post_time TIMESTAMP WITH TIME ZONE;
                END IF;
            END $$;

            -- Create declined_posts table
            CREATE TABLE IF NOT EXISTS declined_posts (
                id SERIAL PRIMARY KEY,
                original_post_id INTEGER,
                title TEXT,
                source TEXT,
                declined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                declined_by TEXT,
                reason TEXT
            );

            -- Create source_tiers table
            CREATE TABLE IF NOT EXISTS source_tiers (
                id SERIAL PRIMARY KEY,
                source_name TEXT UNIQUE,
                tier INTEGER,
                trust_level TEXT
            );

            -- Populate source_tiers with defaults
            INSERT INTO source_tiers (source_name, tier, trust_level)
            VALUES 
                ('Toei Animation', 1, 'Always Reliable'),
                ('MAPPA', 1, 'Always Reliable'),
                ('Crunchyroll Official', 1, 'Always Reliable'),
                ('Shueisha', 1, 'Always Reliable'),
                ('Ufotable', 1, 'Always Reliable'),
                ('Kyoto Animation', 1, 'Always Reliable'),
                ('Wit Studio', 1, 'Always Reliable'),
                ('Bones', 1, 'Always Reliable'),
                ('A-1 Pictures', 1, 'Always Reliable'),
                ('MyAnimeList', 2, 'Usually Reliable'),
                ('Anime News Network', 2, 'Usually Reliable'),
                ('Funimation', 2, 'Usually Reliable'),
                ('Crunchyroll News', 2, 'Usually Reliable'),
                ('ComicBook.com', 2, 'Usually Reliable')
            ON CONFLICT (source_name) DO UPDATE 
            SET tier = EXCLUDED.tier, trust_level = EXCLUDED.trust_level;

            -- Update existing posts to 'published' status if they are already published
            UPDATE posts SET status = 'published' WHERE is_published = TRUE AND status = 'pending';
        `
    });

    if (error1) {
        console.error('Migration failed:', error1);
    } else {
        console.log('Migration successful!');
    }
}

migrate();
