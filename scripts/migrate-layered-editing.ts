
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
    console.log('--- STARTING IMAGE LAYERED EDITING MIGRATION ---');

    const { error } = await supabase.rpc('run_sql', {
        sql: `
            DO $$ 
            BEGIN 
                -- background_image
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='background_image') THEN
                    ALTER TABLE posts ADD COLUMN background_image TEXT;
                    COMMENT ON COLUMN posts.background_image IS 'The raw background image URL (no text, no branding)';
                END IF;

                -- image_settings
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='image_settings') THEN
                    ALTER TABLE posts ADD COLUMN image_settings JSONB;
                    COMMENT ON COLUMN posts.image_settings IS 'JSON configuration for layered rendering (text scale, position, toggles, etc.)';
                END IF;
            END $$;
        `
    });

    if (error) {
        console.error('Migration failed:', error);
    } else {
        console.log('Migration successful: background_image and image_settings columns added.');
    }
}

migrate();
