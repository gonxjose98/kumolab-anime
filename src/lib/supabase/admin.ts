
// Force immediate validation and export
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pytehpdxophkhuxnnqzj.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5dGVocGR4b3Boa2h1eG5ucXpqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODE3Mjc1OSwiZXhwIjoyMDgzNzQ4NzU5fQ.oXPumZ99rcY4hfiaQ4qEMLBd5-34bd6N9_oA7n1pCH0';

if (!supabaseUrl || !supabaseKey) {
    throw new Error(`Supabase Init Failed. URL: ${supabaseUrl ? 'OK' : 'MISSING'}, KEY: ${supabaseKey ? 'OK' : 'MISSING'}`);
}

import { createClient } from '@supabase/supabase-js';

// This is a server-side client that uses the SERVICE_ROLE_KEY if available
// Use this for administrative tasks like image uploads to storage
export const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
