import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function migrate() {
    console.log('Starting migration...');

    // 1. Add columns to posts table
    const columns = [
        { name: 'status', type: 'text', default: "'published'" },
        { name: 'source_tier', type: 'integer', default: '3' },
        { name: 'relevance_score', type: 'integer', default: '0' },
        { name: 'is_duplicate', type: 'boolean', default: 'false' },
        { name: 'duplicate_of', type: 'integer' },
        { name: 'scraped_at', type: 'timestamp with time zone' },
        { name: 'approved_at', type: 'timestamp with time zone' },
        { name: 'approved_by', type: 'text' },
        { name: 'scheduled_post_time', type: 'timestamp with time zone' },
        { name: 'source', type: 'text', default: "'Unknown'" }
    ];

    for (const col of columns) {
        console.log(`Adding column ${col.name}...`);
        const { error } = await supabase.rpc('execute_sql', {
            sql: `ALTER TABLE posts ADD COLUMN IF NOT EXISTS ${col.name} ${col.type} ${col.default ? `DEFAULT ${col.default}` : ''};`
        });
        if (error) {
            // If RPC is not available, we might need another way or just assume it's done via Dashboard
            // But let's try direct postgres if possible. 
            // Actually, Supabase doesn't have a direct 'execute_sql' RPC by default for security.
            console.error(`Error adding column ${col.name}:`, error.message);
        }
    }

    // 2. Create declined_posts table
    console.log('Creating declined_posts table...');
    const { error: declinedError } = await supabase.rpc('execute_sql', {
        sql: `
            CREATE TABLE IF NOT EXISTS declined_posts (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL,
                reason TEXT,
                declined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                fingerprint TEXT UNIQUE
            );
        `
    });
    if (declinedError) console.error('Error creating declined_posts:', declinedError.message);

    // 3. Create source_tiers table
    console.log('Creating source_tiers table...');
    const { error: tiersError } = await supabase.rpc('execute_sql', {
        sql: `
            CREATE TABLE IF NOT EXISTS source_tiers (
                id SERIAL PRIMARY KEY,
                source_name TEXT UNIQUE NOT NULL,
                tier INTEGER CHECK (tier IN (1, 2, 3)) DEFAULT 3,
                notes TEXT
            );
            
            INSERT INTO source_tiers (source_name, tier) 
            VALUES 
                ('Official Twitter', 1),
                ('Comic Natalie', 1),
                ('Anime News Network', 1),
                ('Reddit', 2),
                ('Discord', 3)
            ON CONFLICT (source_name) DO NOTHING;
        `
    });
    if (tiersError) console.error('Error creating source_tiers:', tiersError.message);

    console.log('Migration attempt finished.');
}

migrate();
