import { createClient } from '@supabase/supabase-js';

// No fallback URL/key — production must supply these via env. A previous version
// fell back to a hardcoded URL that pointed at a since-deleted Supabase project,
// which silently routed all writes into the void while workers reported success.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error(
        `Supabase admin init failed — env vars missing. ` +
        `URL: ${supabaseUrl ? 'OK' : 'MISSING NEXT_PUBLIC_SUPABASE_URL'}, ` +
        `KEY: ${supabaseKey ? 'OK' : 'MISSING SUPABASE_SERVICE_ROLE_KEY'}`
    );
}

// Service role bypasses RLS — never expose this client to the browser.
export const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
