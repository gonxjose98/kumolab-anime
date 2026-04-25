import { createClient } from '@supabase/supabase-js';

// No silent fallback — missing env vars must throw at build time, not at first query.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error(
        `Supabase client init failed — env vars missing. ` +
        `URL: ${supabaseUrl ? 'OK' : 'MISSING NEXT_PUBLIC_SUPABASE_URL'}, ` +
        `KEY: ${supabaseKey ? 'OK' : 'MISSING NEXT_PUBLIC_SUPABASE_ANON_KEY'}`
    );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
