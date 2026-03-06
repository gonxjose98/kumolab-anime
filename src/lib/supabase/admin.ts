import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pytehpdxophkhuxnnqzj.supabase.co';

// CRITICAL: Admin client MUST use service_role key to bypass RLS.
// Previously this fell back to NEXT_PUBLIC_SUPABASE_ANON_KEY which caused
// silent delete failures — Supabase returns {error: null} even when RLS blocks the operation.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5dGVocGR4b3Boa2h1eG5ucXpqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODE3Mjc1OSwiZXhwIjoyMDgzNzQ4NzU5fQ.oXPumZ99rcY4hfiaQ4qEMLBd5-34bd6N9_oA7n1pCH0';

if (!supabaseUrl || !supabaseKey) {
    throw new Error(`Supabase Init Failed. URL: ${supabaseUrl ? 'OK' : 'MISSING'}, KEY: ${supabaseKey ? 'OK' : 'MISSING'}`);
}

// Server-side admin client — bypasses RLS for all operations (insert, update, delete)
export const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
